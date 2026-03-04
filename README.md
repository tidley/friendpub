# sec06 — Nostr key rotation PoC (NIP-17 + threshold Schnorr)

PoC web client showing key rotation from `old_npub -> new_npub` using guardian quorum attestations.

## Scope implemented

- NIP-17 DMs (gift-wrap) for request + partial replies
- 2-of-3 guardian threshold demo
- Minimal 3-role UI:
  - **Requester** (new key)
  - **Guardian**
  - **Observer/Verifier**
- Rotation proof event published publicly (custom kind `39089`)
- Verification against guardian policy group public key

## Crypto model (PoC)

- Trusted dealer setup generates 2-of-3 shares of one group secret.
- Guardians produce partials over canonical rotate message hash:
  - `H("rotate|old_npub|new_npub|nonce")`
- Requester aggregates partials into one Schnorr-style proof `(R, z)`.
- Verifier checks: `z*G == R + c*X` where `X` is guardian group pubkey.

> This is a **PoC threshold Schnorr model**, not hardened production FROST.

## Run

```bash
npm install
npm run dev
```

Open local URL from Vite.

## Fast demo flow

1. Click **Run scripted demo**.
2. See state transition and verified proof in the proof panel.

## Network DM flow

1. In **Requester**:
   - set old npub
   - generate/import new nsec
   - guardian lines format: `id,npub,groupPubkey` (one per line)
   - send request
2. In **Guardian**:
   - import guardian nsec
   - set guardian share JSON:
     ```json
     {"id":1,"share":"<hex>","threshold":2,"groupPubkey":"<hex>"}
     ```
   - refresh + confirm
3. Back in **Requester**:
   - refresh DMs
   - aggregate partials
   - publish proof
4. In **Observer**:
   - load policy JSON
   - fetch proofs
   - verify

## Files

- `index.html` UI
- `src/main.js` role workflows
- `src/nostr.js` NIP-17 and relay ops
- `src/frost.js` threshold Schnorr PoC math
