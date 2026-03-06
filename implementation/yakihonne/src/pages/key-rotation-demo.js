import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { nip19 } from "nostr-tools";
import { useDispatch, useSelector } from "react-redux";
import { sendMessage } from "@/Helpers/DMHelpers";
import {
  aggregateRotationProof,
  deriveGuardianSecretProof,
  parseRotationAttestationV2,
  parseRotationPartial,
  verifyRotationProof,
} from "@/Helpers/RotationProof";
import { InitEvent } from "@/Helpers/Controlers";
import { setToPublish } from "@/Store/Slides/Publishers";
import { relaysOnPlatform } from "@/Content/Relays";
import {
  getActiveGuardianSetups,
  ingestGuardianSetupsFromChatrooms,
} from "@/Helpers/GuardianSetupIndex";

const ROTATION_PROOF_KIND = 39093;
const DEMO_STATE_KEY = "rotation-demo-v2-state";

const emptyGuardians = [
  { npub: "", secret: "" },
  { npub: "", secret: "" },
  { npub: "", secret: "" },
];

function KeyRotationDemoPage() {
  const dispatch = useDispatch();
  const userKeys = useSelector((state) => state.userKeys);
  const userChatrooms = useSelector((state) => state.userChatrooms);
  const userInboxRelays = useSelector((state) => state.userInboxRelays);

  const [oldNpub, setOldNpub] = useState("");
  const [newNpub, setNewNpub] = useState("");
  const [nonce, setNonce] = useState("");
  const [reason, setReason] = useState("key compromise");
  const [guardiansRows, setGuardiansRows] = useState(emptyGuardians);
  const [selectedSetupId, setSelectedSetupId] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");
  const [partialRows, setPartialRows] = useState([]);
  const [proofPayload, setProofPayload] = useState(null);

  const resolvedNewNpub = useMemo(() => {
    if (newNpub.trim()) return newNpub.trim();
    try {
      return userKeys?.pub ? nip19.npubEncode(userKeys.pub) : "";
    } catch {
      return "";
    }
  }, [newNpub, userKeys]);

  const indexedSetups = useMemo(() => {
    ingestGuardianSetupsFromChatrooms(userChatrooms || []);
    return getActiveGuardianSetups();
  }, [userChatrooms]);

  const selectedSetup = useMemo(
    () => indexedSetups.find((s) => s.record_id === selectedSetupId) || indexedSetups[0] || null,
    [indexedSetups, selectedSetupId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(DEMO_STATE_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      setOldNpub(s.oldNpub || "");
      setNewNpub(s.newNpub || "");
      setNonce(s.nonce || "");
      setReason(s.reason || "key compromise");
      setGuardiansRows(Array.isArray(s.guardiansRows) && s.guardiansRows.length === 3 ? s.guardiansRows : emptyGuardians);
      setSelectedSetupId(s.selectedSetupId || "");
      setRecoveryMode(!!s.recoveryMode);
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
          newNpub,
          nonce,
          reason,
          guardiansRows,
          selectedSetupId,
          recoveryMode,
        }),
      );
    } catch (e) {
      // Ignore quota errors; this is demo UX persistence only.
      // eslint-disable-next-line no-console
      console.warn("[key-rotation-demo] localStorage persist failed", e?.message || e);
    }
  }, [oldNpub, newNpub, nonce, reason, guardiansRows, selectedSetupId, recoveryMode]);

  const updateGuardianCell = (idx, key, value) => {
    setGuardiansRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const collectPartials = () => {
    const reqNonce = nonce.trim();
    const reqNew = resolvedNewNpub;
    const rows = [];

    // If a setup is selected, prefer matching that group_id to avoid mixing attestations from different setups.
    const expectedGroupId = selectedSetup?.group_id || "";

    for (const room of userChatrooms || []) {
      for (const msg of room.convo || []) {
        const raw = msg.raw_content || msg.content;
        const v2 = parseRotationAttestationV2(raw);
        if (
          v2 &&
          (!reqNew || v2.new_npub === reqNew) &&
          (!reqNonce || v2.nonce === reqNonce) &&
          (!expectedGroupId || v2.group_id === expectedGroupId)
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
    const uniqueGroupIds = Array.from(new Set(rows.map((r) => r?.group_id).filter(Boolean)));

    setSendResult(
      `collected ${rows.length} matching partial message(s) from ${uniqueIds.size} unique guardian(s)` +
        (idsList.length ? ` (ids: ${idsList.join(",")})` : "") +
        (uniqueGroupIds.length ? ` (group_ids: ${uniqueGroupIds.join(",")})` : "") +
        (expectedGroupId ? ` (filtered to group_id=${expectedGroupId})` : ""),
    );
  };

  const aggregateProof = () => {
    try {
      const reqNonce = nonce.trim();
      if (!reqNonce || !resolvedNewNpub) throw new Error("new npub/nonce required");

      const derivedGroupId = selectedSetup?.group_id || partialRows.find((r) => r.group_id)?.group_id || "";
      const setupForGroup =
        indexedSetups.find((s) => s.group_id === derivedGroupId) || selectedSetup;
      if (!setupForGroup?.group_pubkey)
        throw new Error("group_pubkey missing for selected setup. Recovery request can still be sent, but aggregation requires group_pubkey.");

      const req = {
        old_npub:
          oldNpub.trim() ||
          setupForGroup.owner_old_npub ||
          partialRows.find((r) => r.old_npub)?.old_npub,
        new_npub: resolvedNewNpub,
        nonce: reqNonce,
      };
      if (!req.old_npub) throw new Error("old npub unresolved");

      const seen = new Set();
      const picked = [];
      for (const row of partialRows) {
        // Avoid mixing partials from a different guardian setup/group.
        if (row?.group_id && row.group_id !== setupForGroup.group_id) continue;
        const id = row.partial?.id;
        if (seen.has(id)) continue;
        seen.add(id);
        picked.push(row.partial);
        if (picked.length >= 2) break;
      }
      if (picked.length < 2) {
        const allIds = partialRows.map((r) => r?.partial?.id).filter((x) => Number.isFinite(Number(x)));
        const uniq = Array.from(new Set(allIds)).sort((a, b) => Number(a) - Number(b));
        throw new Error(`need 2 unique guardian partials (found ids: ${uniq.join(",") || "none"})`);
      }

      const signature = aggregateRotationProof(req, picked, setupForGroup.group_pubkey);
      const valid_local = verifyRotationProof(req, signature, setupForGroup.group_pubkey);
      const payload = {
        type: "rotation-proof",
        version: 2,
        old_npub: req.old_npub,
        new_npub: req.new_npub,
        nonce: req.nonce,
        group_id: setupForGroup.group_id,
        guardian_set_hash: `g-${setupForGroup.group_id}`,
        threshold: 2,
        group_pubkey: setupForGroup.group_pubkey,
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

  const sendRotationRequest = async () => {
    try {
      setSending(true);
      setSendResult("");
      const reqNonce = nonce.trim() || crypto.randomUUID();
      if (!resolvedNewNpub) throw new Error("new npub required");

      const setup = selectedSetup;
      if (!recoveryMode && !setup?.group_id)
        throw new Error("Select a guardian setup record or enable recovery mode");
      if (recoveryMode && !oldNpub.trim())
        throw new Error("old npub required in recovery mode");

      let okCount = 0;
      for (let i = 0; i < guardiansRows.length; i++) {
        const row = guardiansRows[i];
        if (!row.npub?.trim()) continue;
        if (!row.secret?.trim()) throw new Error(`guardian #${i + 1} secret required`);
        const decoded = nip19.decode(row.npub.trim());
        if (decoded.type !== "npub") continue;
        const reqId = crypto.randomUUID();
        const guardian_id = i + 1;
        const oldNpubForReq = oldNpub.trim() || setup?.owner_old_npub || "";
        const groupIdForReq = recoveryMode ? "" : setup?.group_id || "";
        const payload = {
          type: "rotation-request",
          version: 2,
          req_id: reqId,
          group_id: groupIdForReq || null,
          guardian_id,
          claimed_name: "",
          old_npub: oldNpubForReq,
          old_npub_hint: oldNpubForReq,
          new_npub: resolvedNewNpub,
          shared_secret: row.secret.trim(),
          secret_proof: deriveGuardianSecretProof({
            sharedSecret: row.secret.trim(),
            req_id: reqId,
            nonce: reqNonce,
            group_id: groupIdForReq,
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

      setNonce(reqNonce);
      setSendResult(`sent ${okCount}/3 rotation-request v2 DMs`);
    } catch (e) {
      setSendResult(`send failed: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: "24px auto", padding: "0 12px", color: "#e7ebff" }}>
      <h1 style={{ marginBottom: 8 }}>Key rotation demo (NIP-17 guardians)</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Use setup-record mode when available, or recovery mode from a new npub without local setup records.
      </p>

      <section style={box}>
        <h3 style={h3}>Requester mode (send rotation request v2)</h3>
        <div style={grid}>
          <input style={input} value={oldNpub} onChange={(e) => setOldNpub(e.target.value)} placeholder={recoveryMode ? "Old npub (required)" : "Old npub (optional hint)"} />
          <input style={input} value={newNpub} onChange={(e) => setNewNpub(e.target.value)} placeholder="New npub (blank = logged in account)" />
          <input style={input} value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Nonce (blank = auto-generate)" />
          <input style={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        </div>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={recoveryMode}
            onChange={(e) => setRecoveryMode(e.target.checked)}
          />
          Recovery mode (no setup record on this account)
        </label>

        <div style={{ marginTop: 8, opacity: recoveryMode ? 0.6 : 1 }}>
          <label className="p-medium">Setup record</label>
          <select
            style={{ ...input, width: "100%", marginTop: 4 }}
            disabled={recoveryMode}
            value={selectedSetup?.record_id || ""}
            onChange={(e) => setSelectedSetupId(e.target.value)}
          >
            {indexedSetups.length === 0 && <option value="">No setup records found in DMs</option>}
            {indexedSetups.map((s) => (
              <option key={s.record_id} value={s.record_id}>
                {s.group_id} • guardian #{s.guardian_id} • {s.owner_old_npub?.slice(0, 16)}...
              </option>
            ))}
          </select>
          {!recoveryMode && selectedSetup && !selectedSetup.group_pubkey && (
            <p className="p-medium" style={{ color: "#ffcc80", marginTop: 6 }}>
              Selected setup has no group_pubkey. You can send recovery requests, but aggregation/publish will be blocked until group_pubkey is available.
            </p>
          )}
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
const btn = { border: "1px solid #3a66cb", borderRadius: 8, background: "#19336f", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const th = { textAlign: "left", borderBottom: "1px solid #30487f", padding: "6px" };
const td = { padding: "6px", verticalAlign: "top" };

// Disable SSR for this demo page to avoid hydration mismatches from client-side extensions
// (e.g., Dark Reader mutating inline styles before React hydrates).
export default dynamic(() => Promise.resolve(KeyRotationDemoPage), { ssr: false });
