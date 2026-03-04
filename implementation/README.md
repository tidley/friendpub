# implementation

This folder vendors a popular web Nostr client and adds a key-rotation demo integration.

## Clients included
- **Coracle** (https://github.com/coracle-social/coracle)
- **Yakihonne** (https://github.com/yakihonne/yakihonne-web-app)

## Added feature
### Coracle
- Route: `/key-rotation-demo`
- File: `coracle/src/app/views/KeyRotationDemo.svelte`

### Yakihonne
- Route: `/key-rotation-demo`
- File: `yakihonne/client/src/Pages/NOSTR/KeyRotationDemo.js`
- Registered in: `yakihonne/client/src/App.js`
- Includes trusted guardian box, request fields, safe-words demo input, and guardian confirmation box.

## Run locally (Yakihonne)
```bash
cd implementation/yakihonne/client
npm install
npm run dev
```
Open the local URL and visit `/key-rotation-demo`.

## Security
- No private keys, tokens, or secrets are committed.
