<script lang="ts">
  const guardians = [
    {id: 1, name: "Guardian A", trust: "trusted"},
    {id: 2, name: "Guardian B", trust: "trusted"},
    {id: 3, name: "Guardian C", trust: "trusted"},
  ]

  const steps = [
    "User creates new keypair",
    "User sends rotation request over NIP-17 DMs",
    "Guardians review and confirm",
    "2-of-3 guardian partial signatures collected",
    "Requester aggregates threshold Schnorr proof",
    "Rotation proof event published and observer verifies",
  ]
</script>

<div class="p-6 max-w-3xl mx-auto flex flex-col gap-4">
  <h1 class="text-2xl font-bold">Key Rotation Demo (friendpub integration)</h1>
  <p class="text-sm text-neutral-400">
    This demo view mirrors the friendpub PoC flow for social key rotation using threshold guardian attestations.
  </p>

  <div class="trust-box">
    <div class="font-bold mb-2">Trusted Guardian Set (2-of-3)</div>
    <div class="flex gap-2 flex-wrap">
      {#each guardians as g}
        <div class="guardian-pill">{g.name} • #{g.id}</div>
      {/each}
    </div>
  </div>

  <div class="card p-4">
    <div class="font-bold mb-2">Step-by-step flow</div>
    <ol>
      {#each steps as step, i}
        <li class="mb-2">{i + 1}. {step}</li>
      {/each}
    </ol>
  </div>

  <div class="card p-4">
    <div class="font-bold mb-2">How to run full PoC</div>
    <p class="text-sm text-neutral-300">Open the friendpub sub-app and click <strong>Run scripted demo</strong> to see trusted guardians, threshold collection, and verification state transitions.</p>
  </div>
</div>

<style>
  .trust-box {
    border: 1px solid #1d4ed8;
    border-radius: 10px;
    background: #0a1a3a;
    padding: 12px;
  }
  .guardian-pill {
    border: 1px solid #2563eb;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    background: #0b2a5b;
  }
  .card {
    border: 1px solid #2a2a3a;
    border-radius: 10px;
    background: #1b1b29;
  }
</style>
