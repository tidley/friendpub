# implementation

This folder vendors a popular web Nostr client and adds a key-rotation demo integration.

## Client chosen
- **Coracle** (https://github.com/coracle-social/coracle)

## Added feature
- Route: `/key-rotation-demo`
- File: `coracle/src/app/views/KeyRotationDemo.svelte`
- Registers a walkthrough page showing:
  - trusted guardian set box (2-of-3)
  - step-by-step rotation flow
  - pointer to run the full friendpub PoC demo

## Security
- No private keys, tokens, or secrets are committed.
