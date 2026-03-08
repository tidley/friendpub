# GSD — friendpub (sec06)

Last updated: 2026-03-08

## TL;DR
Nostr NIP-17 guardian-based key rotation demo + related helpers/tests. Main work is on `/key-rotation-demo` UX + DM flows.

## Where is the code?
- Working copy: `/home/tom/code/sec06/friendpub`
- GitHub: https://github.com/tidley/friendpub
- Active branch: `feat/guardian-setup-recovery-v1`

## What we changed recently
- `/key-rotation-demo`:
  - Added **Send setup via DM** in “Guardian setup (deterministic group_id)” section.
  - Setup share generation supports **t-of-n** via Shamir split.
  - Switched to **one DM per guardian**: `guardian-setup` (v1) with embedded `share`.
  - Persist embedded share during ingestion (`guardian-share-map-v1`) so confirm flow works without separate share DM.
  - Added top-right progress toast for both setup send + rotation-request send.
  - Increased DM timeouts/backoffs to better tolerate flaky networks.

## Current state
- Core demo flows are implemented; DM reliability is dependent on reachable NIP-17 relays.

## Known issues / caveats
- Relay connectivity: if Firefox can’t connect to given `wss://…` endpoints, sends will fail regardless of UI.
- Some other subprojects in `implementation/` may have their own test/deps issues; Yakihonne unit tests were passing when last checked.

## Next steps
- Add UI to show which DM relays are connected/used.
- Optionally allow selecting a smaller relay set for DMs.
