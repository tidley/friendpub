import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { computeDeterministicGroupId } from "../../../src/Helpers/GuardianGroupId";

describe("computeDeterministicGroupId", () => {
  it("is deterministic and order-invariant for the same guardian set", () => {
    const pk1 = "1".repeat(64);
    const pk2 = "2".repeat(64);
    const pk3 = "3".repeat(64);

    const npubs = [nip19.npubEncode(pk1), nip19.npubEncode(pk2), nip19.npubEncode(pk3)];

    const gidA = computeDeterministicGroupId({ threshold: 2, guardian_npubs: npubs });
    const gidB = computeDeterministicGroupId({ threshold: 2, guardian_npubs: [npubs[2], npubs[0], npubs[1]] });

    expect(gidA).toMatch(/^g_[0-9a-f]{64}$/i);
    expect(gidA).toBe(gidB);
  });

  it("changes when threshold changes", () => {
    const pk1 = "a".repeat(64);
    const pk2 = "b".repeat(64);
    const npubs = [nip19.npubEncode(pk1), nip19.npubEncode(pk2)];

    const gid2of2 = computeDeterministicGroupId({ threshold: 2, guardian_npubs: npubs });
    const gid1of2 = computeDeterministicGroupId({ threshold: 1, guardian_npubs: npubs });

    expect(gid2of2).not.toBe(gid1of2);
  });

  it("returns empty string for invalid inputs", () => {
    expect(computeDeterministicGroupId({ threshold: 2, guardian_npubs: [] })).toBe("");
    expect(computeDeterministicGroupId({ threshold: 0, guardian_npubs: ["npub1bad"] })).toBe("");
    expect(computeDeterministicGroupId({ threshold: 3, guardian_npubs: ["npub1bad"] })).toBe("");
  });
});
