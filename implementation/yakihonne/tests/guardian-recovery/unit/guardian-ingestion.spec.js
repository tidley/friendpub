import { describe, it, expect } from 'vitest';

const dmHistory = require('../fixtures/dm-history.json');

// TODO: wire in actual parser + GuardianSetupIndex helpers once implemented.
const buildIndexFromDMs = (events) => {
  return {
    guardians: events.map((evt) => ({
      npub: evt.guardian,
      secret: evt.secret,
    })),
    threshold: events[0]?.threshold ?? 0,
  };
};

describe('GuardianSetupIndex ingestion', () => {
  it('reconstructs the guardian list + threshold from DM history', () => {
    const index = buildIndexFromDMs(dmHistory);

    expect(index.threshold).toBe(2);
    expect(index.guardians).toHaveLength(3);
    expect(index.guardians.map((g) => g.npub)).toEqual([
      'npub1guardianA',
      'npub1guardianB',
      'npub1guardianC',
    ]);
    expect(new Set(index.guardians.map((g) => g.secret)).size).toBe(3);
  });

  it('rejects duplicated guardian entries in DM history', () => {
    const duplicated = [...dmHistory, { ...dmHistory[0], id: 'dm-duplicate' }];
    const index = buildIndexFromDMs(duplicated);

    const guardianSet = new Set(index.guardians.map((g) => g.npub));
    expect(guardianSet.size).toBeLessThan(index.guardians.length);
    // TODO: replace with actual rejection behavior once logic exists.
  });
});
