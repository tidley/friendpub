# Status — friendpub (sec06)

Last updated: 2026-03-08

## Repo location
- Working copy: `/home/tom/code/sec06/friendpub`
- GitHub: https://github.com/tidley/friendpub
- Active branch: `feat/guardian-setup-recovery-v1`

## What this is
Nostr NIP-17 guardian-based key rotation demo + related implementation notes/tests.

## Recent changes (high level)
- `/key-rotation-demo`:
  - Added “Send setup via DM” inside the deterministic group_id section.
  - Setup DM supports **t-of-n** via Shamir split.
  - Switched to **one DM per guardian** (guardian-setup with embedded share).
  - Added top-right progress toast for setup + rotation-request send flows.
  - Lengthened DM connection + publish timeouts/backoffs for flaky networks.

## Known issues / caveats
- DM sending depends heavily on reachable NIP-17 relays; network flakiness can still cause failures.
- Some unrelated test suites in other subprojects may be noisy; Yakihonne unit tests currently pass.

## Next steps
- Consider surfacing which relay(s) are connected/used when sending DMs.
- Consider allowing selecting a DM relay set explicitly from the UI.
