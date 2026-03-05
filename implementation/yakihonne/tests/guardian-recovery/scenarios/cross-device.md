# Cross-device Recovery Scenario

## Objective
Verify that a fresh client (no preserved localStorage) can reconstruct the guardian setup purely from DM history, honoring the 2-of-3 threshold and guardian-specific secrets.

## Setup
1. Enable a test mode where the app accepts injected DM history (e.g., via `window.__TEST_DM_HISTORY__` or a mock API).  
2. Use fixture `tests/guardian-recovery/fixtures/dm-history.json`.  
3. Ensure localStorage/IndexedDB is cleared before the scenario runs.

## Steps
1. Launch the client in a clean context (Playwright/Cypress incognito).  
2. Provide the DM history fixture through the mock API or direct ingestion hook.  
3. Trigger the recovery flow: request guardian approval, ensure guardian state (pubkeys, secrets, threshold=2) is rebuilt.  
4. Complete recovery with two guardian approvals, ensure npub rotation succeeds.

## Assertions
- GuardianSetupIndex matches fixture (guardians, secrets, threshold).  
- UI shows recovered guardian list and permits recovery.  
- Recovery finalizes after two approvals, no localStorage data involved.

## Negative cases
- **No setup DM history**: client surfaces setup instructions and does not recover.  
- **Conflicting updates**: when history contains two conflicting guardian records (different thresholds/secrets), ingestion should stop and notify.  
- **Revoked setup**: if DM history includes a revocation marker, system blocks recovery even if older records exist.

## Tooling note
- Run as an e2e test via Playwright or Cypress pointing at a dev server (`pnpm dev`), injecting fixture DM history via a test-only API or page hook.
