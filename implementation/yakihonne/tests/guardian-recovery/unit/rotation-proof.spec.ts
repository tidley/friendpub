import { describe, expect, it } from "vitest";
import dmFixture from "../fixtures/dm-history.json";
import {
  buildGuardianSetupRecordId,
  deriveGuardianSecretProof,
  parseGuardianSetupV1,
  parseRotationAttestationV2,
  parseRotationRequestV2,
} from "../../../src/Helpers/RotationProof";

const groupId = dmFixture.group_id;
const ownerOldNpub = dmFixture.owner_old_npub;
const groupPubkey = dmFixture.group_pubkey;

const buildSetupPayload = (guardian: { id: number; npub: string; created_at: number }) => {
  const payload = {
    type: "guardian-setup",
    version: 1,
    group_id: groupId,
    guardian_id: guardian.id,
    owner_old_npub: ownerOldNpub,
    guardian_npub: guardian.npub,
    group_pubkey: groupPubkey,
    threshold: 2,
    guardian_count: 3,
    participant_ids: [1, 2, 3],
    created_at: guardian.created_at,
    updated_at: guardian.created_at,
    status: "active",
  } as Record<string, any>;
  payload.record_id = buildGuardianSetupRecordId({
    group_id: payload.group_id,
    guardian_id: payload.guardian_id,
    owner_old_npub: payload.owner_old_npub,
  });
  return payload;
};

const buildRotationRequestPayload = () => {
  const rotationRequest = dmFixture.rotationRequest;
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    type: "rotation-request",
    version: 2,
    req_id: rotationRequest.req_id,
    guardian_id: rotationRequest.guardian_id,
    group_id: null,
    old_npub: ownerOldNpub,
    new_npub: rotationRequest.new_npub,
    secret_proof: "",
    nonce: rotationRequest.nonce,
    reason: rotationRequest.reason,
    created_at: timestamp,
    expires_at: timestamp + (rotationRequest.expires_offset || 3600),
  } as Record<string, any>;
  payload.secret_proof = deriveGuardianSecretProof({
    sharedSecret: rotationRequest.secret,
    req_id: payload.req_id,
    nonce: payload.nonce,
    group_id,
    old_npub: payload.old_npub,
    guardian_id: payload.guardian_id,
  });
  return payload;
};

describe("RotationProof parsing helpers", () => {
  it("accepts a valid guardian setup payload", () => {
    const guardian = dmFixture.guardians[0];
    const payload = buildSetupPayload(guardian);
    const parsed = parseGuardianSetupV1(JSON.stringify(payload));
    expect(parsed).toMatchObject({
      type: "guardian-setup",
      version: 1,
      group_id: groupId,
      guardian_id: guardian.id,
      owner_old_npub: ownerOldNpub,
    });
    expect(parsed?.record_id).toBe(payload.record_id);
  });

  it("rejects malformed guardian setup payloads", () => {
    const payload = buildSetupPayload(dmFixture.guardians[0]);
    payload.group_id = "bad";
    payload.guardian_npub = "npub1bad";
    expect(parseGuardianSetupV1(JSON.stringify(payload))).toBeNull();
  });

  it("parses valid rotation-request v2 payloads", () => {
    const payload = buildRotationRequestPayload();
    const parsed = parseRotationRequestV2(payload);
    expect(parsed).not.toBeNull();
    expect(parsed?.guardian_id).toBe(payload.guardian_id);
    expect(parsed?.group_id).toBe("");
    expect(parsed?.secret_proof).toBe(payload.secret_proof);
  });

  it("rejects rotation-request v2 without required fields", () => {
    const payload = buildRotationRequestPayload();
    delete payload.nonce;
    expect(parseRotationRequestV2(payload)).toBeNull();
  });

  it("parses valid rotation-attestation v2 payloads", () => {
    const requestPayload = buildRotationRequestPayload();
    const guardian = dmFixture.guardians[1];
    const recordId = buildGuardianSetupRecordId({
      group_id: groupId,
      guardian_id: guardian.id,
      owner_old_npub: ownerOldNpub,
    });
    const attestation = {
      type: "rotation-attestation",
      version: 2,
      req_id: requestPayload.req_id,
      record_id: recordId,
      group_id: groupId,
      guardian_id: guardian.id,
      old_npub: ownerOldNpub,
      new_npub: requestPayload.new_npub,
      nonce: requestPayload.nonce,
      partial: {
        id: 2,
        R_i: "02" + "c".repeat(64),
        z_i: "0".repeat(64),
      },
    };
    const parsed = parseRotationAttestationV2(attestation);
    expect(parsed).toMatchObject({
      guardian_id: guardian.id,
      group_id: groupId,
      nonce: requestPayload.nonce,
    });
    expect(parsed?.partial?.id).toBe(2);
  });

  it("rejects rotation-attestation missing partial data", () => {
    const requestPayload = buildRotationRequestPayload();
    const guardian = dmFixture.guardians[1];
    const recordId = buildGuardianSetupRecordId({
      group_id: groupId,
      guardian_id: guardian.id,
      owner_old_npub: ownerOldNpub,
    });
    const attestation = {
      type: "rotation-attestation",
      version: 2,
      req_id: requestPayload.req_id,
      record_id: recordId,
      group_id: groupId,
      guardian_id: guardian.id,
      old_npub: ownerOldNpub,
      new_npub: requestPayload.new_npub,
      nonce: requestPayload.nonce,
      partial: {
        id: 2,
        R_i: "",
        z_i: "",
      },
    };
    expect(parseRotationAttestationV2(attestation)).toBeNull();
  });
});
