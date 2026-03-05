import React, { useMemo, useState } from "react";
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

export default function KeyRotationDemoPage() {
  const dispatch = useDispatch();
  const userKeys = useSelector((state) => state.userKeys);
  const userChatrooms = useSelector((state) => state.userChatrooms);
  const userInboxRelays = useSelector((state) => state.userInboxRelays);
  const [oldNpub, setOldNpub] = useState("");
  const [newNpub, setNewNpub] = useState("");
  const [nonce, setNonce] = useState("");
  const [reason, setReason] = useState("key compromise");
  const [guardiansInput, setGuardiansInput] = useState("");
  const [groupId, setGroupId] = useState("");
  const [guardianId, setGuardianId] = useState("1");
  const [sharedSecret, setSharedSecret] = useState("");
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

  const parseGuardians = () =>
    guardiansInput
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, npub] = line.split(",").map((x) => x.trim());
        return { id: Number(id), npub };
      })
      .filter((g) => Number.isInteger(g.id) && g.npub?.startsWith("npub1"));

  const indexedSetups = useMemo(() => {
    ingestGuardianSetupsFromChatrooms(userChatrooms || []);
    return getActiveGuardianSetups();
  }, [userChatrooms]);

  const selectedSetup = useMemo(
    () =>
      indexedSetups.find(
        (s) => s.group_id === groupId.trim() && Number(s.guardian_id) === Number(guardianId),
      ) || null,
    [indexedSetups, groupId, guardianId],
  );

  const collectPartials = () => {
    const reqNonce = nonce.trim();
    const reqNew = resolvedNewNpub;
    const rows = [];
    for (const room of userChatrooms || []) {
      for (const msg of room.convo || []) {
        const raw = msg.raw_content || msg.content;
        const v2 = parseRotationAttestationV2(raw);
        if (v2 && v2.new_npub === reqNew && v2.nonce === reqNonce) {
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
        if (p.new_npub === reqNew && p.nonce === reqNonce) {
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
    setSendResult(`collected ${rows.length} matching partial message(s)`);
  };

  const aggregateProof = () => {
    try {
      const reqNonce = nonce.trim();
      if (!reqNonce || !resolvedNewNpub) throw new Error("new npub/nonce required");

      let derivedGroupId = groupId.trim();
      if (!derivedGroupId) {
        derivedGroupId = partialRows.find((r) => r.group_id)?.group_id || "";
      }
      const setupForGroup = indexedSetups.find((s) => s.group_id === derivedGroupId);
      if (!setupForGroup?.group_pubkey) throw new Error("group setup/group pubkey not found in indexed DM history");

      const req = {
        old_npub: oldNpub.trim() || setupForGroup.owner_old_npub || partialRows.find((r) => r.old_npub)?.old_npub,
        new_npub: resolvedNewNpub,
        nonce: reqNonce,
      };
      if (!req.old_npub) throw new Error("old npub unresolved");

      const seen = new Set();
      const picked = [];
      for (const row of partialRows) {
        const id = row.partial?.id;
        if (seen.has(id)) continue;
        seen.add(id);
        picked.push(row.partial);
        if (picked.length >= 2) break;
      }
      if (picked.length < 2) throw new Error("need 2 unique guardian partials");

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
      const guardians = parseGuardians();
      const reqNonce = nonce.trim() || crypto.randomUUID();
      if (!resolvedNewNpub) throw new Error("new npub required");
      if (!groupId.trim()) throw new Error("group id required");
      if (!sharedSecret.trim()) throw new Error("shared secret required");
      if (guardians.length === 0) throw new Error("add guardian lines: id,npub");

      let okCount = 0;
      for (const g of guardians) {
        const decoded = nip19.decode(g.npub);
        if (decoded.type !== "npub") continue;
        const reqId = crypto.randomUUID();
        const payload = {
          type: "rotation-request",
          version: 2,
          req_id: reqId,
          group_id: groupId.trim(),
          guardian_id: g.id,
          claimed_name: "",
          old_npub_hint: oldNpub.trim(),
          new_npub: resolvedNewNpub,
          secret_proof: deriveGuardianSecretProof({
            sharedSecret: sharedSecret.trim(),
            req_id: reqId,
            nonce: reqNonce,
            group_id: groupId.trim(),
            guardian_id: g.id,
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
      setSendResult(`sent ${okCount}/${guardians.length} rotation-request v2 DMs`);
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
        v2 request flow uses group_id + secret_proof and indexed guardian setup records from DM history.
      </p>

      <section style={box}>
        <h3 style={h3}>Requester mode (send rotation request v2)</h3>
        <div style={grid}>
          <input style={input} value={oldNpub} onChange={(e) => setOldNpub(e.target.value)} placeholder="Old npub (optional hint)" />
          <input style={input} value={newNpub} onChange={(e) => setNewNpub(e.target.value)} placeholder="New npub (blank = logged in account)" />
          <input style={input} value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Nonce (blank = auto-generate)" />
          <input style={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
          <input style={input} value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="Group ID" />
          <input style={input} value={sharedSecret} onChange={(e) => setSharedSecret(e.target.value)} placeholder="Shared secret (guardian-specific)" />
        </div>
        <textarea
          style={{ ...input, marginTop: 8, minHeight: 80, width: "100%" }}
          value={guardiansInput}
          onChange={(e) => setGuardiansInput(e.target.value)}
          placeholder={"Guardians (one per line):\n1,npub1...\n2,npub1...\n3,npub1..."}
        />
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
        <h3 style={h3}>Selected setup for aggregation</h3>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(selectedSetup, null, 2)}</pre>
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
