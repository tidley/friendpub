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

## Network DM flow (manual, step-by-step)

> ⚠️ Demo-only. Do **not** use real recovery phrases, real identity keys, or important accounts.

### Before you start

Open the app in **5 browser tabs/windows**:

- 1 tab = **Requester**
- 3 tabs = **Guardian** (one per guardian)
- 1 tab = **Observer**

Use the same relay list in all tabs.

### Demo guardian labels (“safe words”)

Use these words only as operator labels (human memory aid):

- Guardian #1 → **Pancho**
- Guardian #2 → **Climbing**
- Guardian #3 → **Yolo**

These words are **not** the cryptographic share themselves. They just help you track which guardian tab is which.

### Copy/paste example values

- Example old npub:
  - `npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2u6x9q`
- Example group pubkey:
  - `02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`

Requester → **Guardian npubs** field:

```text
1,npub1guardianxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1,02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
2,npub1guardianyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy2,02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
3,npub1guardianzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz3,02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Guardian #1 (Pancho) share JSON:
```json
{"id":1,"share":"1111111111111111111111111111111111111111111111111111111111111111","threshold":2,"groupPubkey":"02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

Guardian #2 (Climbing) share JSON:
```json
{"id":2,"share":"2222222222222222222222222222222222222222222222222222222222222222","threshold":2,"groupPubkey":"02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

Guardian #3 (Yolo) share JSON:
```json
{"id":3,"share":"3333333333333333333333333333333333333333333333333333333333333333","threshold":2,"groupPubkey":"02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

---

### Step 1 — Requester sends rotation request

In **Requester** tab:

1. Paste `old npub`
2. Click **Generate new key** (or paste new nsec)
3. Paste guardian lines into **Guardian npubs**
4. Set reason (e.g. `key compromise`)
5. Click **Send rotation request via NIP-17 DM**

Expected result:
- Status shows request sent.

### Step 2 — Guardians receive request message

In each **Guardian** tab:

1. Set that guardian’s nsec
2. Paste that guardian’s share JSON
3. Click **Refresh incoming requests**

Expected result:
- You should see a `rotation-request` in guardian inbox.
- This is the “message came through” check.

### Step 3 — Guardian confirm or deny decision

Current UI behavior:
- **Confirm path supported directly**: click **Confirm first pending request** (sends a partial signature).
- **Deny path for now**: do not click confirm in that guardian tab (treated as no approval).

For a 2-of-3 demo:
- Confirm in any 2 guardian tabs (e.g. Pancho + Climbing)
- Leave the 3rd unconfirmed (Yolo)

### Step 4 — Requester collects partials

Back in **Requester** tab:

1. Click **Refresh DMs**
2. Verify partials appear under **Collected partials**
3. Click **Aggregate 2-of-3 proof**

Expected result:
- Proof panel shows `valid_local: true`.

### Step 5 — Publish proof

In **Requester** tab:

1. Click **Publish proof event**

Expected result:
- Status says proof published.

### Step 6 — Observer verifies

In **Observer** tab:

1. Paste policy JSON (or use one generated in Requester)
2. Click **Fetch proof events**

Expected result:
- Output includes proof entries with `valid: true` when verification succeeds.

---

> Note: Example keys/shares above are intentionally fake for walkthrough UX. Use generated, matching values for realistic crypto tests.

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
