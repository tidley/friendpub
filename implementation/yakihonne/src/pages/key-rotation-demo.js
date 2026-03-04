import React, { useMemo, useState } from "react";
import { nip19 } from "nostr-tools";
import { useSelector } from "react-redux";
import { sendMessage } from "@/Helpers/DMHelpers";

export default function KeyRotationDemoPage() {
  const userKeys = useSelector((state) => state.userKeys);
  const [oldNpub, setOldNpub] = useState("");
  const [newNpub, setNewNpub] = useState("");
  const [nonce, setNonce] = useState("");
  const [reason, setReason] = useState("key compromise");
  const [safeWords, setSafeWords] = useState("");
  const [guardiansInput, setGuardiansInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");
  const [g1, setG1] = useState(false);
  const [g2, setG2] = useState(false);
  const [g3, setG3] = useState(false);

  const confirmations = [g1, g2, g3].filter(Boolean).length;
  const thresholdMet = confirmations >= 2;

  const resolvedNewNpub = useMemo(() => {
    if (newNpub.trim()) return newNpub.trim();
    try {
      return userKeys?.pub ? nip19.npubEncode(userKeys.pub) : "";
    } catch {
      return "";
    }
  }, [newNpub, userKeys]);

  const output = useMemo(
    () => ({
      old_npub: oldNpub,
      new_npub: resolvedNewNpub,
      nonce,
      reason,
      safe_words_entered: safeWords ? "yes" : "no",
      threshold: "2-of-3",
      confirmations,
      threshold_met: thresholdMet,
      next_state: thresholdMet ? "aggregate_signature" : "waiting_for_guardians",
    }),
    [oldNpub, resolvedNewNpub, nonce, reason, safeWords, confirmations, thresholdMet]
  );

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

  const sendRotationRequest = async () => {
    try {
      setSending(true);
      setSendResult("");

      const guardians = parseGuardians();
      const reqNonce = nonce.trim() || crypto.randomUUID();
      if (!oldNpub.trim()) throw new Error("old npub required");
      if (!resolvedNewNpub) throw new Error("new npub required");
      if (guardians.length === 0) throw new Error("add guardian lines: id,npub");

      const payload = {
        type: "rotation-request",
        old_npub: oldNpub.trim(),
        new_npub: resolvedNewNpub,
        nonce: reqNonce,
        reason: reason.trim(),
        participant_ids: [1, 2, 3],
      };

      let okCount = 0;
      for (const g of guardians) {
        const decoded = nip19.decode(g.npub);
        if (decoded.type !== "npub") continue;
        const ok = await sendMessage(decoded.data, JSON.stringify(payload));
        if (ok) okCount++;
      }

      setNonce(reqNonce);
      setSendResult(`sent ${okCount}/${guardians.length} rotation-request DMs`);
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
        Demo page now supports requester mode: send rotation-request DMs to guardians from Yakihonne.
      </p>

      <section style={box}>
        <h3 style={h3}>Requester mode (send rotation request)</h3>
        <div style={grid}>
          <input style={input} value={oldNpub} onChange={(e) => setOldNpub(e.target.value)} placeholder="Old npub" />
          <input style={input} value={newNpub} onChange={(e) => setNewNpub(e.target.value)} placeholder="New npub (blank = use logged in account)" />
          <input style={input} value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Nonce (blank = auto-generate)" />
          <input style={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        </div>
        <textarea
          style={{ ...input, marginTop: 8, minHeight: 80, width: "100%" }}
          value={guardiansInput}
          onChange={(e) => setGuardiansInput(e.target.value)}
          placeholder={"Guardians (one per line):\n1,npub1...\n2,npub1...\n3,npub1..."}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={sendRotationRequest} disabled={sending} style={btn}>
            {sending ? "Sending..." : "Send rotation request via DM"}
          </button>
          {sendResult && <span style={{ fontSize: 13, opacity: 0.9 }}>{sendResult}</span>}
        </div>
      </section>

      <section style={box}>
        <h3 style={h3}>Trusted guardians (2-of-3)</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Guardian A", "Guardian B", "Guardian C"].map((g, i) => (
            <span key={g} style={pill}>{g} • #{i + 1}</span>
          ))}
        </div>
      </section>

      <section style={box}>
        <h3 style={h3}>Guardian confirmation box (simulated state)</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label><input type="checkbox" checked={g1} onChange={(e) => setG1(e.target.checked)} /> Guardian A confirms</label>
          <label><input type="checkbox" checked={g2} onChange={(e) => setG2(e.target.checked)} /> Guardian B confirms</label>
          <label><input type="checkbox" checked={g3} onChange={(e) => setG3(e.target.checked)} /> Guardian C confirms</label>
        </div>
        <p style={{ marginBottom: 0 }}>Status: {thresholdMet ? "✅ threshold met" : "⏳ waiting for 2 confirmations"}</p>
      </section>

      <section style={box}>
        <h3 style={h3}>Step-by-step</h3>
        <ol>
          <li>Use requester mode above to send `rotation-request` to guardians</li>
          <li>In Messages, guardians open DM and click Confirm on request bubble</li>
          <li>Collect `rotation-partial` replies in requester workflow</li>
        </ol>
      </section>

      <section style={box}>
        <h3 style={h3}>Demo state</h3>
        <textarea
          style={{ ...input, marginBottom: 8, minHeight: 80, width: "100%" }}
          value={safeWords}
          onChange={(e) => setSafeWords(e.target.value)}
          placeholder="Safe words (demo only, do not paste real secret phrases)"
        />
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(output, null, 2)}</pre>
      </section>
    </div>
  );
}

const box = { border: "1px solid #30487f", borderRadius: 12, background: "#0f1d3f", padding: 12, marginBottom: 12 };
const h3 = { margin: "0 0 8px 0" };
const pill = { border: "1px solid #3a66cb", borderRadius: 999, fontSize: 12, padding: "4px 10px", background: "#112a61" };
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const input = { border: "1px solid #3a4c7b", borderRadius: 8, background: "#0c1630", color: "#e7ebff", padding: 8 };
const btn = { border: "1px solid #3a66cb", borderRadius: 8, background: "#19336f", color: "#fff", padding: "8px 12px", cursor: "pointer" };
