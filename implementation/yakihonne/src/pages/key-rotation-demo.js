import React, { useMemo, useState } from "react";

export default function KeyRotationDemoPage() {
  const [oldNpub, setOldNpub] = useState("");
  const [newNpub, setNewNpub] = useState("");
  const [nonce, setNonce] = useState("");
  const [reason, setReason] = useState("key compromise");
  const [safeWords, setSafeWords] = useState("");
  const [g1, setG1] = useState(false);
  const [g2, setG2] = useState(false);
  const [g3, setG3] = useState(false);

  const confirmations = [g1, g2, g3].filter(Boolean).length;
  const thresholdMet = confirmations >= 2;

  const output = useMemo(
    () => ({
      old_npub: oldNpub,
      new_npub: newNpub,
      nonce,
      reason,
      safe_words_entered: safeWords ? "yes" : "no",
      threshold: "2-of-3",
      confirmations,
      threshold_met: thresholdMet,
      next_state: thresholdMet ? "aggregate_signature" : "waiting_for_guardians",
    }),
    [oldNpub, newNpub, nonce, reason, safeWords, confirmations, thresholdMet]
  );

  return (
    <div style={{ maxWidth: 920, margin: "24px auto", padding: "0 12px", color: "#e7ebff" }}>
      <h1 style={{ marginBottom: 8 }}>Key rotation demo (NIP-17 guardians)</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Demo-only UX page for threshold guardian confirmation. No private keys are stored here.
      </p>

      <section style={box}>
        <h3 style={h3}>Trusted guardians (2-of-3)</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Guardian A", "Guardian B", "Guardian C"].map((g, i) => (
            <span key={g} style={pill}>{g} • #{i + 1}</span>
          ))}
        </div>
      </section>

      <section style={box}>
        <h3 style={h3}>Rotation request</h3>
        <div style={grid}>
          <input style={input} value={oldNpub} onChange={(e) => setOldNpub(e.target.value)} placeholder="Old npub" />
          <input style={input} value={newNpub} onChange={(e) => setNewNpub(e.target.value)} placeholder="New npub" />
          <input style={input} value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Nonce" />
          <input style={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        </div>
        <textarea
          style={{ ...input, marginTop: 8, minHeight: 80, width: "100%" }}
          value={safeWords}
          onChange={(e) => setSafeWords(e.target.value)}
          placeholder="Safe words (demo only, do not paste real secret phrases)"
        />
      </section>

      <section style={box}>
        <h3 style={h3}>Guardian confirmation box</h3>
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
          <li>Create new keypair</li>
          <li>Send NIP-17 rotation request DM</li>
          <li>Guardians confirm</li>
          <li>Collect 2 partials</li>
          <li>Aggregate proof</li>
          <li>Publish + verify rotation</li>
        </ol>
      </section>

      <section style={box}>
        <h3 style={h3}>Demo state</h3>
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
