import React, { useMemo, useState } from "react";

export default function KeyRotationDemo() {
  const [oldNpub, setOldNpub] = useState("");
  const [newNpub, setNewNpub] = useState("");
  const [nonce, setNonce] = useState("");
  const [reason, setReason] = useState("key compromise");
  const [safeWords, setSafeWords] = useState("");
  const [g1, setG1] = useState(false);
  const [g2, setG2] = useState(false);
  const [g3, setG3] = useState(false);
  const [ran, setRan] = useState(false);

  const confirmations = [g1, g2, g3].filter(Boolean).length;
  const thresholdMet = confirmations >= 2;

  const summary = useMemo(
    () => ({
      old_npub: oldNpub,
      new_npub: newNpub,
      nonce,
      reason,
      safe_words_entered: safeWords ? "yes" : "no",
      confirmations,
      threshold: "2-of-3",
      threshold_met: thresholdMet,
      status: thresholdMet ? "ready_to_aggregate" : "waiting_for_guardians",
    }),
    [oldNpub, newNpub, nonce, reason, safeWords, confirmations, thresholdMet]
  );

  return (
    <div className="fit-container fx-centered" style={{ padding: "2rem 0" }}>
      <div style={{ width: "min(900px, 92vw)", display: "grid", gap: "12px" }}>
        <h3>Key rotation demo (NIP-17 guardian flow)</h3>
        <p className="gray-c p-medium">
          Demo UI only. No private keys are stored by this page. Use test/recovery
          words only.
        </p>

        <div style={boxStyle}>
          <h5 style={{ marginBottom: 8 }}>Trusted guardians (2-of-3)</h5>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Guardian A", "Guardian B", "Guardian C"].map((g, i) => (
              <span key={g} style={pillStyle}>{g} • #{i + 1}</span>
            ))}
          </div>
        </div>

        <div style={boxStyle}>
          <h5 style={{ marginBottom: 8 }}>Rotation request</h5>
          <div style={gridStyle}>
            <input value={oldNpub} onChange={(e) => setOldNpub(e.target.value)} placeholder="Old npub" />
            <input value={newNpub} onChange={(e) => setNewNpub(e.target.value)} placeholder="New npub" />
            <input value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Nonce" />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
          </div>
          <textarea
            value={safeWords}
            onChange={(e) => setSafeWords(e.target.value)}
            placeholder="Safe words / recovery phrase (demo only)"
            style={{ width: "100%", minHeight: 74, marginTop: 10 }}
          />
        </div>

        <div style={boxStyle}>
          <h5 style={{ marginBottom: 8 }}>Guardian confirmations</h5>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label><input type="checkbox" checked={g1} onChange={(e) => setG1(e.target.checked)} /> Guardian A</label>
            <label><input type="checkbox" checked={g2} onChange={(e) => setG2(e.target.checked)} /> Guardian B</label>
            <label><input type="checkbox" checked={g3} onChange={(e) => setG3(e.target.checked)} /> Guardian C</label>
          </div>
          <p className="p-medium" style={{ marginTop: 8 }}>
            Status: {thresholdMet ? "✅ threshold met" : "⏳ waiting for 2 confirmations"}
          </p>
          <button className="btn btn-normal" onClick={() => setRan(true)}>
            Simulate confirm + aggregate
          </button>
        </div>

        {ran && (
          <div style={boxStyle}>
            <h5 style={{ marginBottom: 8 }}>Demo output</h5>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(summary, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

const boxStyle = {
  border: "1px solid #2b3a67",
  borderRadius: 12,
  padding: 12,
  background: "#0f1c38",
};

const pillStyle = {
  border: "1px solid #2f58b7",
  borderRadius: 999,
  fontSize: 12,
  padding: "4px 10px",
  background: "#102a64",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};
