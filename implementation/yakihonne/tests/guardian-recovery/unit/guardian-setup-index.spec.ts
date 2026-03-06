import { afterEach, beforeEach, describe, expect, it } from "vitest";
import dmFixture from "../fixtures/dm-history.json";

const createLocalStorageMock = () => {
  const store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
};

beforeEach(() => {
  const storage = createLocalStorageMock();
  const fakeWindow = {
    localStorage: storage,
  };
  (globalThis as any).window = fakeWindow;
  (globalThis as any).localStorage = storage;
});

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});
import {
  buildGuardianSetupRecordId,
  deriveGuardianSecretProof,
} from "../../../src/Helpers/RotationProof";
import {
  findGuardianSetupsForRequestV2,
  getActiveGuardianSetups,
  ingestGuardianSetupsFromChatrooms,
} from "../../../src/Helpers/GuardianSetupIndex";

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

const buildChatrooms = () =>
  dmFixture.guardians.map((guardian) => {
    const setupMsg = {
      id: `setup-${guardian.id}`,
      created_at: guardian.created_at,
      pubkey: guardian.npub,
      raw_content: JSON.stringify(buildSetupPayload(guardian)),
    };
    const update = dmFixture.updates.find((u) => u.guardian_id === guardian.id);
    const convo = [setupMsg];
    if (update) {
      const updatePayload = {
        type: "guardian-setup-update",
        version: 1,
        record_id: buildGuardianSetupRecordId({
          group_id: groupId,
          guardian_id: update.guardian_id,
          owner_old_npub: ownerOldNpub,
        }),
        group_id: groupId,
        guardian_id: update.guardian_id,
        status: update.status,
        updated_at: update.updated_at,
      };
      convo.push({
        id: `update-${update.guardian_id}`,
        created_at: update.updated_at,
        pubkey: guardian.npub,
        raw_content: JSON.stringify(updatePayload),
      });
    }
    return {
      pubkey: guardian.npub,
      convo,
    };
  });

const buildRecoveryRequestPayload = () => {
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
    nonce: rotationRequest.nonce,
    reason: rotationRequest.reason,
    created_at: timestamp,
    expires_at: timestamp + (rotationRequest.expires_offset || 3600),
    secret_proof: "",
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

describe("GuardianSetupIndex ingestion", () => {
  it("indexes setup + update DMs and filters revocations", () => {
    const chatrooms = buildChatrooms();
    const index = ingestGuardianSetupsFromChatrooms(chatrooms);
    const revokedRecord = buildGuardianSetupRecordId({
      group_id: groupId,
      guardian_id: dmFixture.guardians[0].id,
      owner_old_npub: ownerOldNpub,
    });
    expect(index.byRecordId[revokedRecord]).toBeDefined();
    expect(index.byRecordId[revokedRecord].status).toBe("revoked");

    const active = getActiveGuardianSetups();
    expect(active).toHaveLength(2);
    expect(active.map((row) => row.guardian_id)).toEqual(expect.arrayContaining([2, 3]));
  });

  it("matches recovery-mode requests using guardian_id + old_npub", () => {
    const chatrooms = buildChatrooms();
    ingestGuardianSetupsFromChatrooms(chatrooms);
    const requestPayload = buildRecoveryRequestPayload();
    const matches = findGuardianSetupsForRequestV2(requestPayload);
    expect(matches).toHaveLength(1);
    expect(matches[0].guardian_id).toBe(requestPayload.guardian_id);
    expect(matches[0].group_id).toBe(groupId);
  });

  it("runs the happy-path scenario: setup → recovery request → matching setup + proof", () => {
    const chatrooms = buildChatrooms();
    ingestGuardianSetupsFromChatrooms(chatrooms);
    const requestPayload = buildRecoveryRequestPayload();
    const parsed = findGuardianSetupsForRequestV2(requestPayload);
    expect(parsed).toHaveLength(1);
    const candidate = parsed[0];
    const proof = deriveGuardianSecretProof({
      sharedSecret: dmFixture.rotationRequest.secret,
      req_id: requestPayload.req_id,
      nonce: requestPayload.nonce,
      group_id: requestPayload.group_id || candidate.group_id,
      old_npub: requestPayload.old_npub || candidate.owner_old_npub,
      guardian_id: candidate.guardian_id,
    });
    expect(proof).toBe(requestPayload.secret_proof);
  });
});
