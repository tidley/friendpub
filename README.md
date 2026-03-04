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
3. Open **Demo Walkthrough** tab to view:
   - trusted guardian box
   - step-by-step status with checkmarks
   - compact demo state summary

## Network DM flow

> ⚠️ Demo-only data below. Do **not** use these keys/shares for real funds or identity security.

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

### Copy/paste demo data (example)

Use these for a quick local demo wiring:

- Example old npub:
  - `npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2u6x9q`
- Example guardian group pubkey (compressed secp256k1 hex):
  - `02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`

Paste into **Requester → Guardian npubs** (3 lines):

```text
1,npub1guardianxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1,02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
2,npub1guardianyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy2,02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
3,npub1guardianzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz3,02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Paste into **Guardian → Guardian share JSON** (change `id`/`share` per guardian):

Guardian 1:
```json
{"id":1,"share":"1111111111111111111111111111111111111111111111111111111111111111","threshold":2,"groupPubkey":"02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

Guardian 2:
```json
{"id":2,"share":"2222222222222222222222222222222222222222222222222222222222222222","threshold":2,"groupPubkey":"02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

Guardian 3:
```json
{"id":3,"share":"3333333333333333333333333333333333333333333333333333333333333333","threshold":2,"groupPubkey":"02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

> Note: These are intentionally fake example values for UI/demo copy-paste. Use generated values for any real testnet/mainnet-like scenarios.

## Tests

```bash
npm test
```

- Uses Vitest
- Covers threshold signing/verification and Nostr helper utilities

## Implementation references (popular clients)

`implementation/` contains vendored client integrations for demo UX work:

- `implementation/coracle` (Coracle)
  - demo route: `/key-rotation-demo`
- `implementation/yakihonne` (official YakiHonne web app)
  - demo route: `/key-rotation-demo`
  - run:
    ```bash
    cd implementation/yakihonne
    pnpm install
    pnpm dev
    ```

## Files

- `index.html` UI
- `src/main.js` role workflows
- `src/nostr.js` NIP-17 and relay ops
- `src/frost.js` threshold Schnorr PoC math
- `test/` Vitest suite
