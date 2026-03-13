import { describe, expect, it } from "vitest";
import dmFixture from "../fixtures/dm-history.json";
import {
  aggregateRotationProofFromAttestationsV2,
  buildRotationRequestV2Batch,
  collectRotationAttestationsV2,
} from "../../../src/Helpers/RotationDemoFlow";

const ownerOldNpub = dmFixture.owner_old_npub;
const groupId = dmFixture.group_id;
const groupPubkey = dmFixture.group_pubkey;

describe("Rotation demo full flow (no browser)", () => {
  it("builds a rotation-request v2 batch with a single req_id + nonce for all recipients", () => {
    const batch = buildRotationRequestV2Batch({
      old_npub: ownerOldNpub,
      new_npub: "npub1newnewnewnewnewnewnewnewnewnewnewnewnewnewnewnewnewnewnew",
      reason: "compromised",
      group_id: "",
      participant_ids: [1, 2],
      req_id: "req-batch-001",
      nonce: "nonce-batch-001",
      guardians: [
        { guardian_id: 1, shared_secret: "secA" },
        { guardian_id: 2, shared_secret: "secB" },
        { guardian_id: 3, shared_secret: "secC" },
      ],
    });

    expect(batch.req_id).toBe("req-batch-001");
    expect(batch.nonce).toBe("nonce-batch-001");
    expect(batch.payloads).toHaveLength(3);

    // critical invariant: same req_id + nonce across all recipients
    const uniqReqIds = new Set(batch.payloads.map((p) => p.req_id));
    const uniqNonces = new Set(batch.payloads.map((p) => p.nonce));
    expect(Array.from(uniqReqIds)).toEqual(["req-batch-001"]);
    expect(Array.from(uniqNonces)).toEqual(["nonce-batch-001"]);

    // sanity: guardian_id differs per recipient
    expect(batch.payloads.map((p) => p.guardian_id)).toEqual([1, 2, 3]);
    expect(batch.payloads.every((p) => typeof p.secret_proof === "string" && p.secret_proof.length > 10)).toBe(true);
  });

  it("collects 2 unique guardian attestations for a given req_id/nonce and aggregates, rejecting mixed req_id/nonce", async () => {
    const req_id = "req-demo-collect-001";
    const nonce = "nonce-demo-collect-001";
    const new_npub = "npub1ffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    // Use valid curve points for R_i so noble doesn't throw.
    const secp = await import("@noble/secp256k1");
    const R1 = secp.Point.BASE.multiply(1n).toHex(true);
    const R2 = secp.Point.BASE.multiply(2n).toHex(true);

    const att1 = {
      type: "rotation-attestation",
      version: 2,
      req_id,
      record_id: "r1",
      group_id: groupId,
      guardian_id: 1,
      old_npub: ownerOldNpub,
      new_npub,
      nonce,
      partial: { id: 1, R_i: R1, z_i: "1".repeat(64) },
    };

    const att2 = {
      type: "rotation-attestation",
      version: 2,
      req_id,
      record_id: "r2",
      group_id: groupId,
      guardian_id: 2,
      old_npub: ownerOldNpub,
      new_npub,
      nonce,
      partial: { id: 2, R_i: R2, z_i: "2".repeat(64) },
    };

    // bad ones: should be filtered out by collector and rejected by aggregator if mixed in.
    const wrongReqId = { ...att2, req_id: "req-other" };
    const wrongNonce = { ...att2, nonce: "nonce-other" };

    const collected = collectRotationAttestationsV2(
      [
        { from: "guardian-pub-1", raw: att1, created_at: 10 },
        { from: "guardian-pub-2", raw: att2, created_at: 20 },
        { from: "guardian-pub-2", raw: wrongReqId, created_at: 30 },
        { from: "guardian-pub-2", raw: wrongNonce, created_at: 40 },
      ],
      { req_id, nonce, new_npub },
    );

    // collector should return exactly the 2 matching guardians
    const uniqGuardianIds = new Set(collected.map((r) => r.attestation.guardian_id));
    expect(collected).toHaveLength(2);
    expect(Array.from(uniqGuardianIds).sort()).toEqual([1, 2]);

    // Aggregation should work with homogeneous attestations
    expect(() =>
      aggregateRotationProofFromAttestationsV2(
        { req_id, old_npub: ownerOldNpub, new_npub, nonce },
        collected,
        groupPubkey,
        { threshold: 2 },
      ),
    ).not.toThrow();

    // But MUST reject mixed req_id or nonce if caller attempts to mix them.
    expect(() =>
      aggregateRotationProofFromAttestationsV2(
        { req_id, old_npub: ownerOldNpub, new_npub, nonce },
        [...collected, { from: "guardian-pub-2", created_at: 99, attestation: wrongReqId, partial: wrongReqId.partial }],
        groupPubkey,
      ),
    ).toThrow(/mixed req_id/i);

    expect(() =>
      aggregateRotationProofFromAttestationsV2(
        { req_id, old_npub: ownerOldNpub, new_npub, nonce },
        [...collected, { from: "guardian-pub-2", created_at: 99, attestation: wrongNonce, partial: wrongNonce.partial }],
        groupPubkey,
      ),
    ).toThrow(/mixed nonce/i);
  });
});
