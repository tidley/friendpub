# Guardian Recovery Test Plan

## Goal
- Capture unit and cross-device tests for the guardian-based npub recovery/rotation feature.
- Ensure parsing/ingestion logic can reconstruct guardian state from DM history (without localStorage).

## Tooling
- **Vitest** (preferred): lightweight, works well with TS helpers, snapshot friendly.
  - Add `vitest` + `@vitest/coverage-c8` as devDependencies and a `test`/`test:watch` script (`pnpm vitest`).
  - Tests live under `tests/guardian-recovery` so they stay isolated from app code.

## Structure
```
tests/guardian-recovery/
├── fixtures/
│   └── dm-history.json       # curated DM events for ingestion
├── unit/
│   └── guardian-ingestion.spec.js # parser + GuardianSetupIndex ingestion tests
└── scenarios/
    └── cross-device.md      # plan for e2e scenario w/o localStorage
```

## Unit tests
- Focus on parsing DM payloads + populating the in-memory GuardianSetupIndex.
- Use fixtures (`fixtures/dm-history.json`) representing the 3 guardian DMs, their unique secrets, and metadata (threshold, timestamps).
- Assert: ingestion reconstructs the right guardian pubkeys, secrets, and threshold, rejects duplicates/conflicts, honors revocation markers.
- Include helper mocks for DM parsing utilities.

## Cross-device scenario plan
- Outline in `scenarios/cross-device.md` (see placeholder) describing: launch a clean client (pkgs like Playwright), no localStorage, feed DM history from fixtures, confirm guardian setup recovered, rejection on missing/invalid history.
- Negative cases: (a) no DM history (prompt for setup), (b) conflicting/overlapping history (reject), (c) revoked setup DM present (do not recover).
- Document steps to simulate missing localStorage: run browser context in incognito without persisted storage and stub API returning fixture DM history.

## Run instructions
1. `pnpm install`
2. Unit tests: `pnpm test tests/guardian-recovery/unit`
3. Watch mode: `pnpm test:watch`
4. For cross-device scenario, run Playwright/Cypress flow described in `scenarios/cross-device.md` once the harness is ready.
