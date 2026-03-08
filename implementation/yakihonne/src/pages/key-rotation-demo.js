import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { nip19 } from "nostr-tools";
import { useDispatch, useSelector } from "react-redux";
import { preflightDMRelayConnection, sendMessage } from "@/Helpers/DMHelpers";
import {
  aggregateRotationProof,
  deriveGuardianSecretProof,
  parseRotationAttestationV2,
  parseRotationPartial,
  verifyRotationProof,
} from "@/Helpers/RotationProof";
import { computeDeterministicGroupId } from "@/Helpers/GuardianGroupId";
import { InitEvent } from "@/Helpers/Controlers";
import { setToPublish } from "@/Store/Slides/Publishers";
import { dmRelaysOnPlatform, relaysOnPlatform } from "@/Content/Relays";
import {
  getActiveGuardianSetups,
  ingestGuardianSetupsFromChatrooms,
} from "@/Helpers/GuardianSetupIndex";
import {
  dealerSplitSecretShamir,
  deriveCompressedPubkeyHex,
  getRandomPrivateKeyBytes,
} from "@/Helpers/GuardianGroup";
import { buildGuardianSetupRecordId } from "@/Helpers/RotationProof";

const ROTATION_PROOF_KIND = 39093;
const DEMO_STATE_KEY = "rotation-demo-v2-state";

const makeEmptyGuardians = (n = 3) =>
  Array.from({ length: Math.max(1, Number(n) || 1) }, () => ({ npub: "", secret: "" }));

const DEFAULT_GUARDIAN_COUNT = 3;
const DEFAULT_THRESHOLD = 2;

function KeyRotationDemoPage() {
  const dispatch = useDispatch();
  const userKeys = useSelector((state) => state.userKeys);
  const userChatrooms = useSelector((state) => state.userChatrooms);
  const userInboxRelays = useSelector((state) => state.userInboxRelays);

  // Simplified demo UX: requester is always in recovery mode.
  // - new_npub always = currently logged in account
  // - nonce always auto-generated
  // - no setup dropdown
  const [oldNpub, setOldNpub] = useState("");
  const [nonce, setNonce] = useState("");
  const [reqId, setReqId] = useState("");
  const [reason, setReason] = useState("key compromise");

  // Guardian setup (deterministic group_id)
  const [guardianCount, setGuardianCount] = useState(DEFAULT_GUARDIAN_COUNT);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  // Guardians (npub + secret used for demo DM flow)
  const [guardiansRows, setGuardiansRows] = useState(makeEmptyGuardians(DEFAULT_GUARDIAN_COUNT));
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");
  const [toast, setToast] = useState(null);
  const [partialRows, setPartialRows] = useState([]);
  const [proofPayload, setProofPayload] = useState(null);

  const resolvedNewNpub = useMemo(() => {
    try {
      return userKeys?.pub ? nip19.npubEncode(userKeys.pub) : "";
    } catch {
      return "";
    }
  }, [userKeys]);

  const indexedSetups = useMemo(() => {
    ingestGuardianSetupsFromChatrooms(userChatrooms || []);
    return getActiveGuardianSetups();
  }, [userChatrooms]);

  const computedGroupId = useMemo(() => {
    return computeDeterministicGroupId({
      threshold,
      guardian_npubs: guardiansRows.map((r) => r.npub),
    });
  }, [threshold, guardiansRows]);

  // For aggregation/publish, we still need a group_pubkey.
  // Prefer a setup matching the *current deterministic group_id*.
  const setupForAggregation = useMemo(() => {
    if (computedGroupId) {
      const match = indexedSetups.find((s) => s?.group_id === computedGroupId && s?.group_pubkey);
      if (match) return match;
    }
    return indexedSetups.find((s) => s?.group_pubkey) || indexedSetups[0] || null;
  }, [indexedSetups, computedGroupId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(DEMO_STATE_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      setOldNpub(s.oldNpub || "");
      setNonce(s.nonce || "");
      setReqId(s.reqId || "");
      setReason(s.reason || "key compromise");
      const restoredCount = Number(s.guardianCount || DEFAULT_GUARDIAN_COUNT);
      const restoredThreshold = Number(s.threshold || DEFAULT_THRESHOLD);
      setGuardianCount(Number.isFinite(restoredCount) ? restoredCount : DEFAULT_GUARDIAN_COUNT);
      setThreshold(Number.isFinite(restoredThreshold) ? restoredThreshold : DEFAULT_THRESHOLD);

      if (Array.isArray(s.guardiansRows) && s.guardiansRows.length) {
        setGuardiansRows(s.guardiansRows);
      } else {
        setGuardiansRows(makeEmptyGuardians(restoredCount || DEFAULT_GUARDIAN_COUNT));
      }
      // NOTE: do NOT restore large arrays/objects from localStorage (quota risk)
      // partialRows + proofPayload are intentionally not persisted.
      setPartialRows([]);
      setProofPayload(null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        DEMO_STATE_KEY,
        JSON.stringify({
          oldNpub,
          nonce,
          reqId,
          reason,
          guardianCount,
          threshold,
          guardiansRows,
        }),
      );
    } catch (e) {
      // Ignore quota errors; this is demo UX persistence only.
      // eslint-disable-next-line no-console
      console.warn("[key-rotation-demo] localStorage persist failed", e?.message || e);
    }
  }, [oldNpub, nonce, reqId, reason, guardianCount, threshold, guardiansRows]);

  const updateGuardianCell = (idx, key, value) => {
    setGuardiansRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  useEffect(() => {
    // Resize guardian rows to match guardianCount, preserving existing entries.
    setGuardiansRows((prev) => {
      const n = Math.max(1, Number(guardianCount) || 1);
      const next = prev.slice(0, n);
      while (next.length < n) next.push({ npub: "", secret: "" });
      return next;
    });

    // Clamp threshold into [1, guardianCount]
    setThreshold((prev) => {
      const n = Math.max(1, Number(guardianCount) || 1);
      const t = Number(prev);
      if (!Number.isFinite(t) || t < 1) return 1;
      if (t > n) return n;
      return Math.floor(t);
    });
  }, [guardianCount]);


  const collectPartials = () => {
    const reqNonce = nonce.trim();
    const reqIdFilter = reqId.trim();
    const reqNew = resolvedNewNpub;
    const rows = [];

    for (const room of userChatrooms || []) {
      for (const msg of room.convo || []) {
        const raw = msg.raw_content || msg.content;
        const v2 = parseRotationAttestationV2(raw);
        if (
          v2 &&
          (!reqNew || v2.new_npub === reqNew) &&
          (!reqNonce || v2.nonce === reqNonce) &&
          (!reqIdFilter || String(v2.req_id || "").trim() === reqIdFilter)
        ) {
          rows.push({
            from: room.pubkey,
            created_at: msg.created_at || 0,
            partial: v2.partial,
            group_id: v2.group_id,
            old_npub: v2.old_npub,
            version: 2,
          });
          continue;
        }
        const p = parseRotationPartial(raw);
        if (!p) continue;
        if ((!reqNew || p.new_npub === reqNew) && (!reqNonce || p.nonce === reqNonce)) {
          rows.push({
            from: room.pubkey,
            created_at: msg.created_at || 0,
            partial: p.partial,
            old_npub: p.old_npub,
            version: 1,
          });
        }
      }
    }

    rows.sort((a, b) => b.created_at - a.created_at);
    setPartialRows(rows);

    const uniqueIds = new Set(rows.map((r) => r?.partial?.id).filter((x) => Number.isFinite(Number(x))));
    const idsList = Array.from(uniqueIds).sort((a, b) => Number(a) - Number(b));
    const uniqueFrom = Array.from(new Set(rows.map((r) => (r?.from ? String(r.from).trim() : "")).filter(Boolean)));
    const uniqueGroupIds = Array.from(new Set(rows.map((r) => r?.group_id).filter(Boolean)));

    setSendResult(
      `collected ${rows.length} matching partial message(s) from ${uniqueFrom.length || uniqueIds.size} unique guardian(s)` +
        (uniqueFrom.length ? ` (from: ${uniqueFrom.map((f) => f.slice(0, 12) + "…").join(",")})` : "") +
        (!uniqueFrom.length && idsList.length ? ` (ids: ${idsList.join(",")})` : "") +
        (uniqueGroupIds.length ? ` (group_ids: ${uniqueGroupIds.join(",")})` : ""),
    );
  };

  const aggregateProof = () => {
    try {
      const reqNonce = nonce.trim();
      if (!reqNonce || !resolvedNewNpub) throw new Error("new npub/nonce required");

      const setup = setupForAggregation;
      if (!setup?.group_pubkey)
        throw new Error(
          "group_pubkey missing (no indexed guardian-setup with group_pubkey). Aggregation requires group_pubkey.",
        );

      const derivedGroupId = computedGroupId || setup?.group_id || partialRows.find((r) => r.group_id)?.group_id || "";

      const req = {
        old_npub: oldNpub.trim() || setup.owner_old_npub || partialRows.find((r) => r.old_npub)?.old_npub,
        new_npub: resolvedNewNpub,
        nonce: reqNonce,
      };
      if (!req.old_npub) throw new Error("old npub unresolved");

      // Deduplicate by *guardian identity*, not partial.id.
      // Some guardian implementations currently emit partial.id=1 for all guardians.
      const seenGuardians = new Set();
      const picked = [];
      for (const row of partialRows) {
        const guardianKey = (row?.from && String(row.from).trim())
          ? `from:${String(row.from).trim()}`
          : `id:${String(row?.partial?.id ?? "")}`;

        if (seenGuardians.has(guardianKey)) continue;
        seenGuardians.add(guardianKey);
        picked.push(row.partial);
        if (picked.length >= 2) break;
      }
      if (picked.length < 2) {
        const uniqFrom = Array.from(
          new Set(partialRows.map((r) => (r?.from ? String(r.from).trim() : "")).filter(Boolean)),
        );
        const uniqIds = Array.from(
          new Set(partialRows.map((r) => r?.partial?.id).filter((x) => Number.isFinite(Number(x)))),
        ).sort((a, b) => Number(a) - Number(b));
        throw new Error(
          `need 2 unique guardian partials (found guardians: ${uniqFrom.join(",") || "none"}` +
            `${uniqIds.length ? `; partial.ids: ${uniqIds.join(",")}` : ""})`,
        );
      }

      const signature = aggregateRotationProof(req, picked, setup.group_pubkey);
      const valid_local = verifyRotationProof(req, signature, setup.group_pubkey);
      const payload = {
        type: "rotation-proof",
        version: 2,
        old_npub: req.old_npub,
        new_npub: req.new_npub,
        nonce: req.nonce,
        group_id: derivedGroupId,
        guardian_set_hash: derivedGroupId ? `g-${derivedGroupId}` : "",
        threshold: Number(threshold) || 2,
        group_pubkey: setup.group_pubkey,
        participants: picked.map((p) => p.id),
        signature,
        valid_local,
      };
      setProofPayload(payload);
      setSendResult(valid_local ? "proof aggregated (valid_local=true)" : "proof aggregated but invalid");
    } catch (e) {
      setSendResult(`aggregate failed: ${e.message}`);
    }
  };

  const publishProof = async () => {
    try {
      if (!proofPayload) throw new Error("aggregate first");
      const event = await InitEvent(ROTATION_PROOF_KIND, JSON.stringify(proofPayload), [
        ["old", proofPayload.old_npub],
        ["new", proofPayload.new_npub],
        ["nonce", proofPayload.nonce],
        ["gid", proofPayload.group_id || ""],
      ]);
      if (!event) throw new Error("sign event failed");
      dispatch(
        setToPublish({
          eventInitEx: event,
          allRelays: [...new Set([...(userInboxRelays || []), ...relaysOnPlatform])],
        }),
      );
      setSendResult(`rotation proof queued for publish (kind ${ROTATION_PROOF_KIND})`);
    } catch (e) {
      setSendResult(`publish failed: ${e.message}`);
    }
  };

  const sendGuardianSetupViaDM = async () => {
    try {
      setSending(true);
      setSendResult("");
      setToast(null);

      const isE2E = (typeof window !== "undefined" && Boolean(window.__PLAYWRIGHT__)) || process.env.NEXT_PUBLIC_E2E === "1";
      if (isE2E) {
        setSendResult("e2e: setup DM send skipped");
        return;
      }

      if (!oldNpub.trim()) throw new Error("old npub required (used as owner_old_npub)");
      if (!computedGroupId) throw new Error("computed group_id is empty (check threshold + guardian npubs)");

      const n = Number(guardianCount) || 1;
      const t = Number(threshold) || 1;
      if (t < 1 || t > n) throw new Error("threshold must be between 1 and N");

      const validGuardians = guardiansRows
        .map((r) => (r?.npub || "").trim())
        .filter(Boolean)
        .map((npub) => {
          const decoded = nip19.decode(npub);
          if (decoded.type !== "npub") return null;
          return { npub, pubhex: decoded.data };
        })
        .filter(Boolean);

      if (validGuardians.length !== n) throw new Error(`need exactly ${n} valid guardian npubs`);

      const preflightRelays = [...new Set([...(userInboxRelays || []), ...dmRelaysOnPlatform, ...relaysOnPlatform])];
      const connectedCount = await preflightDMRelayConnection(
        `rotation-demo-setup:${userKeys?.pub || "anon"}`,
        preflightRelays,
      );
      if (!connectedCount) throw new Error("No DM relays connected (preflight failed)");

      // Generate a group key + t-of-n shares (demo dealer). group_id remains deterministic from input npubs.
      const groupSecretBytes = getRandomPrivateKeyBytes();
      const group_pubkey = deriveCompressedPubkeyHex(groupSecretBytes);
      const groupSecretHex = Array.from(groupSecretBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      const participant_ids = Array.from({ length: n }, (_, i) => i + 1);
      const split = dealerSplitSecretShamir({
        groupSecretHex,
        participantIds: participant_ids,
        threshold: t,
      });

      const now = Math.floor(Date.now() / 1000);
      const totalMsgs = n * 2;
      let sentMsgs = 0;

      setToast({ title: "Sending setup via DM", sent: 0, total: totalMsgs, status: "in-progress" });

      for (let i = 0; i < validGuardians.length; i++) {
        const guardian_id = i + 1;
        const g = validGuardians[i];
        const shareRow = (split?.shares || []).find((s) => Number(s.id) === guardian_id);
        if (!shareRow?.share) throw new Error(`missing share for guardian_id=${guardian_id}`);

        const setup = {
          type: "guardian-setup",
          version: 1,
          record_id: buildGuardianSetupRecordId({ group_id: computedGroupId, guardian_id, owner_old_npub: oldNpub.trim() }),
          group_id: computedGroupId,
          guardian_id,
          threshold: t,
          guardian_count: n,
          owner_old_npub: oldNpub.trim(),
          guardian_npub: g.npub,
          group_pubkey,
          participant_ids,
          created_at: now,
          updated_at: now,
          status: "active",
        };

        const shareMsg = {
          type: "guardian-share",
          version: 1,
          group_id: computedGroupId,
          guardian_id,
          threshold: t,
          group_pubkey,
          share: shareRow.share,
          created_at: now,
        };

        const ok1 = await sendMessage(g.pubhex, JSON.stringify(setup));
        sentMsgs += ok1 ? 1 : 0;
        setToast({ title: "Sending setup via DM", sent: sentMsgs, total: totalMsgs, status: "in-progress" });

        const ok2 = await sendMessage(g.pubhex, JSON.stringify(shareMsg));
        sentMsgs += ok2 ? 1 : 0;
        setToast({ title: "Sending setup via DM", sent: sentMsgs, total: totalMsgs, status: "in-progress" });
      }

      setSendResult(`sent ${sentMsgs}/${totalMsgs} setup/share DM(s) for group_id ${computedGroupId.slice(0, 12)}…`);
      setToast({ title: "Setup sent", sent: sentMsgs, total: totalMsgs, status: sentMsgs === totalMsgs ? "ok" : "partial" });

      // Auto-hide toast after a moment.
      setTimeout(() => setToast(null), 3500);
    } catch (e) {
      setSendResult(`setup send failed: ${e.message}`);
      setToast({ title: "Setup failed", sent: 0, total: 0, status: "error", message: String(e.message || e) });
      setTimeout(() => setToast(null), 4500);
    } finally {
      setSending(false);
    }
  };

  const sendRotationRequest = async () => {
    try {
      setSending(true);
      setSendResult("");

      if (nonce.trim() || reqId.trim()) {
        const ok = window.confirm(
          "A rotation request is already staged (nonce/req_id set). Send a NEW request and replace them?",
        );
        if (!ok) return;
      }

      const reqNonce = crypto.randomUUID();
      const reqIdForBatch = crypto.randomUUID();
      if (!resolvedNewNpub) throw new Error("Login required (new npub is current account)");
      if (!oldNpub.trim()) throw new Error("old npub required (recovery mode)");

      const isE2E = (typeof window !== "undefined" && Boolean(window.__PLAYWRIGHT__)) || process.env.NEXT_PUBLIC_E2E === "1";

      // Persist identity up-front so collect/aggregate uses the same.
      setNonce(reqNonce);
      setReqId(reqIdForBatch);

      if (isE2E) {
        // E2E mode: don't depend on live relays.
        setSendResult(`e2e: staged rotation-request v2 (req_id ${reqIdForBatch.slice(0, 8)}…)`);
        return;
      }

      // Preflight: ensure we have at least one DM relay connected before attempting N sends.
      const preflightRelays = [...new Set([...(userInboxRelays || []), ...dmRelaysOnPlatform, ...relaysOnPlatform])];
      const connectedCount = await preflightDMRelayConnection(
        `rotation-demo:${userKeys?.pub || "anon"}`,
        preflightRelays,
      );
      if (!connectedCount) {
        throw new Error(
          "No DM relays connected (preflight failed). Set NEXT_PUBLIC_DM_RELAYS to working NIP-17 relays and retry.",
        );
      }

      let okCount = 0;
      const participant_ids = Array.from({ length: guardiansRows.length }, (_, i) => i + 1);
      const groupIdForReq = computedGroupId;

      for (let i = 0; i < guardiansRows.length; i++) {
        const row = guardiansRows[i];
        if (!row.npub?.trim()) continue;
        if (!row.secret?.trim()) throw new Error(`guardian #${i + 1} secret required`);
        const decoded = nip19.decode(row.npub.trim());
        if (decoded.type !== "npub") continue;

        const reqId = reqIdForBatch;
        const guardian_id = i + 1;
        const oldNpubForReq = oldNpub.trim();

        const payload = {
          type: "rotation-request",
          version: 2,
          req_id: reqId,
          group_id: groupIdForReq || "",
          guardian_id,
          participant_ids,
          claimed_name: "",
          old_npub: oldNpubForReq,
          old_npub_hint: oldNpubForReq,
          new_npub: resolvedNewNpub,
          shared_secret: row.secret.trim(),
          secret_proof: deriveGuardianSecretProof({
            sharedSecret: row.secret.trim(),
            req_id: reqId,
            nonce: reqNonce,
            group_id: groupIdForReq || "",
            old_npub: oldNpubForReq,
            guardian_id,
          }),
          nonce: reqNonce,
          reason: reason.trim(),
          created_at: Math.floor(Date.now() / 1000),
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        };

        const ok = await sendMessage(decoded.data, JSON.stringify(payload));
        if (ok) okCount++;
      }

      setSendResult(`sent ${okCount} rotation-request v2 DM(s) (req_id ${reqIdForBatch.slice(0, 8)}…)`);
    } catch (e) {
      setSendResult(`send failed: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: "24px auto", padding: "0 12px", color: "#e7ebff" }}>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            right: 14,
            bottom: 14,
            width: 320,
            maxWidth: "calc(100vw - 28px)",
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(2,6,23,0.92)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            zIndex: 9999,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>{toast.title}</strong>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setToast(null)}
              style={{ padding: "6px 10px" }}
            >
              Close
            </button>
          </div>
          {Number.isFinite(Number(toast.total)) && toast.total > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              Sent {toast.sent}/{toast.total} • Remaining {Math.max(0, toast.total - toast.sent)}
            </div>
          )}
          {toast?.message && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>{toast.message}</div>
          )}
          <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: "rgba(148,163,184,0.22)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width:
                  toast.total > 0 ? `${Math.round((Math.min(toast.sent, toast.total) / toast.total) * 100)}%` : "100%",
                background:
                  toast.status === "error" ? "#ef4444" : toast.status === "ok" ? "#22c55e" : "#60a5fa",
                transition: "width 180ms ease",
              }}
            />
          </div>
        </div>
      )}
      <h1 style={{ marginBottom: 8 }}>Key rotation demo (NIP-17 guardians)</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Simplified requester UX: recovery mode only. New npub is always your current account.
      </p>

      <section style={box}>
        <h3 style={h3}>Guardian setup (deterministic group_id)</h3>

        <div style={{ ...grid, gridTemplateColumns: "1fr 1fr" }}>
          <label style={label}>
            Guardian count (N)
            <input
              style={{ ...input, width: "100%" }}
              type="number"
              min={1}
              max={12}
              step={1}
              value={guardianCount}
              onChange={(e) => setGuardianCount(Number(e.target.value || 1))}
            />
          </label>
          <label style={label}>
            Threshold (t-of-N)
            <input
              style={{ ...input, width: "100%" }}
              type="number"
              min={1}
              max={Math.max(1, Number(guardianCount) || 1)}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value || 1))}
            />
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <p className="p-medium" style={{ marginBottom: 6 }}>Guardian npubs</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Guardian #</th>
                <th style={th}>npub</th>
              </tr>
            </thead>
            <tbody>
              {guardiansRows.map((row, i) => (
                <tr key={i}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>
                    <input
                      style={{ ...input, width: "100%" }}
                      value={row.npub}
                      onChange={(e) => updateGuardianCell(i, "npub", e.target.value)}
                      placeholder={`Guardian ${i + 1} npub`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8 }}>
          <label style={label}>
            Computed group_id
            <input
              style={{ ...input, width: "100%", opacity: 0.9 }}
              value={computedGroupId || ""}
              readOnly
              placeholder="group_id will appear when threshold + all npubs are valid"
            />
          </label>
          {!computedGroupId && (
            <p className="p-medium" style={{ marginTop: 6, opacity: 0.75 }}>
              Enter {guardianCount} guardian npubs and a valid threshold to derive a stable group_id.
            </p>
          )}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn btn-small"
            type="button"
            onClick={sendGuardianSetupViaDM}
            disabled={sending}
            title="Sends guardian-setup + guardian-share via NIP-17 DM (demo-only)"
          >
            {sending && toast?.status === "in-progress"
              ? `Sending… (${toast.sent}/${toast.total})`
              : "Send setup via DM"}
          </button>
          <span style={{ opacity: 0.75, fontSize: 12 }}>
            Demo-only: sends guardian-setup + guardian-share to each guardian ({threshold}-of-{guardianCount}).
          </span>
        </div>
      </section>

      <section style={box}>
        <h3 style={h3}>Requester mode (send rotation request v2)</h3>

        <div style={grid}>
          <input
            style={input}
            value={oldNpub}
            onChange={(e) => setOldNpub(e.target.value)}
            placeholder="Old npub (required)"
          />
          <input
            style={{ ...input, opacity: 0.85 }}
            value={resolvedNewNpub || ""}
            readOnly
            placeholder="New npub (current account)"
          />
          <input
            style={{ ...input, opacity: 0.85 }}
            value={nonce || ""}
            readOnly
            placeholder="Nonce (auto-generated on send)"
          />
          <input
            style={{ ...input, opacity: 0.85 }}
            value={reqId || ""}
            readOnly
            placeholder="Request id (auto-generated on send)"
          />
          <input style={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        </div>

        <div style={{ marginTop: 8 }}>
          <p className="p-medium" style={{ marginBottom: 6 }}>Guardians (npub + secret)</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Guardian npub</th>
                <th style={th}>Guardian secret</th>
              </tr>
            </thead>
            <tbody>
              {guardiansRows.map((row, i) => (
                <tr key={i}>
                  <td style={td}>
                    <input
                      style={{ ...input, width: "100%" }}
                      value={row.npub}
                      onChange={(e) => updateGuardianCell(i, "npub", e.target.value)}
                      placeholder={`Guardian ${i + 1} npub`}
                    />
                  </td>
                  <td style={td}>
                    <input
                      style={{ ...input, width: "100%" }}
                      value={row.secret}
                      onChange={(e) => updateGuardianCell(i, "secret", e.target.value)}
                      placeholder={`Guardian ${i + 1} secret`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={sendRotationRequest} disabled={sending} style={btn}>
            {sending ? "Sending..." : "Send rotation request via DM"}
          </button>
          <button onClick={collectPartials} style={btn}>Collect matching partials</button>
          <button onClick={aggregateProof} style={btn}>Aggregate Schnorr proof</button>
          <button onClick={publishProof} style={btn}>Publish rotation proof</button>
          {sendResult && <span style={{ fontSize: 13, opacity: 0.9 }}>{sendResult}</span>}
        </div>
      </section>

      <section style={box}>
        <h3 style={h3}>Indexed guardian setups (from DM history)</h3>
        <p className="p-medium">Found: {indexedSetups.length}</p>
        <p className="p-medium" style={{ opacity: 0.85 }}>
          Aggregation uses the first setup with group_pubkey: {setupForAggregation?.record_id || "(none)"}
        </p>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(indexedSetups, null, 2)}</pre>
      </section>

      <section style={box}>
        <h3 style={h3}>Collected partials</h3>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(partialRows, null, 2)}</pre>
      </section>

      <section style={box}>
        <h3 style={h3}>Rotation proof payload</h3>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(proofPayload, null, 2)}</pre>
      </section>
    </div>
  );
}

const box = { border: "1px solid #30487f", borderRadius: 12, background: "#0f1d3f", padding: 12, marginBottom: 12 };
const h3 = { margin: "0 0 8px 0" };
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const input = { border: "1px solid #3a4c7b", borderRadius: 8, background: "#0c1630", color: "#e7ebff", padding: 8 };
const label = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, opacity: 0.9 };
const btn = { border: "1px solid #3a66cb", borderRadius: 8, background: "#19336f", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const th = { textAlign: "left", borderBottom: "1px solid #30487f", padding: "6px" };
const td = { padding: "6px", verticalAlign: "top" };

// Disable SSR for this demo page to avoid hydration mismatches from client-side extensions
// (e.g., Dark Reader mutating inline styles before React hydrates).
export default dynamic(() => Promise.resolve(KeyRotationDemoPage), { ssr: false });
