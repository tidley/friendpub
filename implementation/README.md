# implementation

This folder vendors a popular web Nostr client and adds a key-rotation demo integration.

## Clients included
- **Coracle** (https://github.com/coracle-social/coracle)
- **Yakihonne** (https://github.com/YakiHonne/web-app)

## Added feature
### Coracle
- Route: `/key-rotation-demo`
- File: `coracle/src/app/views/KeyRotationDemo.svelte`

### Yakihonne
- Route: `/key-rotation-demo`
- File: `yakihonne/src/pages/key-rotation-demo.js`
- Includes requester mode:
  - compose/send `rotation-request` DMs to guardian list (`id,npub`)
  - can auto-use logged-in account as `new_npub`
- Also integrated in DM conversation UI:
  - file: `yakihonne/src/Components/ConversationBox.js`
  - detects incoming `rotation-request` JSON messages
  - shows per-message **Confirm** button
  - uses guardian share JSON (saved locally) to send `rotation-partial` response

## Run locally (Yakihonne)
```bash
cd implementation/yakihonne
pnpm install
pnpm dev
```
Runs on port `3400` by default; open `/key-rotation-demo`.

## Security
- No private keys, tokens, or secrets are committed.
