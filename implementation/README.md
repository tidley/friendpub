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
- Includes trusted guardian box, request fields, safe-words demo input, and guardian confirmation box.

## Run locally (Yakihonne)
```bash
cd implementation/yakihonne
pnpm install
pnpm dev
```
Runs on port `3400` by default; open `/key-rotation-demo`.

## Security
- No private keys, tokens, or secrets are committed.
