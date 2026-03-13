import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

const n = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);
const G = secp.Point.BASE;

const mod = (x) => ((x % n) + n) % n;
const hexToBig = (h) => BigInt("0x" + h);
const hexToBytes = (h) => secp.etc.hexToBytes(h);
const numTo32b = (x) => secp.etc.numberToBytesBE(mod(x), 32);
const Hn = (...parts) =>
  mod(secp.etc.bytesToNumberBE(sha256(secp.etc.concatBytes(...parts))));
const sha256Hex = (s) => secp.etc.bytesToHex(sha256(utf8ToBytes(s)));
const isNpub = (v) => typeof v === "string" && /^npub1[023456789acdefghjklmnpqrstuvwxyz]{20,}$/i.test(v.trim());
const isHex = (v, min = 2) => typeof v === "string" && /^[0-9a-f]+$/i.test(v) && v.length >= min;

export const buildGuardianSetupRecordId = ({ group_id, guardian_id, owner_old_npub }) =>
  sha256Hex(`${(group_id || "").trim()}|${Number(guardian_id)}|${(owner_old_npub || "").trim()}`);

// Deterministic group_id derived from a group pubkey (hex, 64 chars).
// This is used to avoid asking the user for both group_id and group_pubkey.
export const buildGuardianGroupIdFromPubkey = (group_pubkey) => {
  const pk = (group_pubkey || "").trim().toLowerCase();
  if (!pk) return "";
  return `g_${sha256Hex(pk)}`;
};

const lagrangeCoef = (id, ids) => {
  const xi = BigInt(id);
  let num = 1n;
  let den = 1n;
  for (const j of ids) {
    if (j === id) continue;
    const xj = BigInt(j);
    num = mod(num * -xj);
    den = mod(den * (xi - xj));
  }
  return mod(num * secp.etc.invert(den, n));
};

const rotateMsgHash = (oldNpub, newNpub, nonce) =>
  sha256(utf8ToBytes(`rotate|${oldNpub}|${newNpub}|${nonce}`));

export const buildRotationPartial = (req, share) => {
  const participantIds = (req.participant_ids && Array.isArray(req.participant_ids) && req.participant_ids.length >= 2)
    ? req.participant_ids
    : [1, 2, 3];
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const x_i = hexToBig(share.share);
  const id = Number(share.id);
  const participantSet = participantIds.map(Number);
  const lambda = lagrangeCoef(id, participantSet);

  const k_i = Hn(utf8ToBytes("nonce"), numTo32b(x_i), utf8ToBytes(req.nonce));
  const R_i = G.multiply(k_i);
  const c = Hn(
    utf8ToBytes("rotate-chal"),
    msg,
    hexToBytes(share.groupPubkey),
  );
  const z_i = mod(k_i + c * lambda * x_i);

  return {
    id,
    R_i: R_i.toHex(true),
    z_i: z_i.toString(16).padStart(64, "0"),
  };
};

export const aggregateRotationProof = (req, partials, groupPubkey) => {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const R = partials
    .map((p) => secp.Point.fromHex(p.R_i))
    .reduce((a, b) => a.add(b), secp.Point.ZERO);
  const z = partials.reduce((a, p) => mod(a + hexToBig(p.z_i)), 0n);
  const c = Hn(utf8ToBytes("rotate-chal"), msg, hexToBytes(groupPubkey));
  return {
    R: R.toHex(true),
    z: z.toString(16).padStart(64, "0"),
    c: c.toString(16),
  };
};

export const verifyRotationProof = (req, sig, groupPubkey) => {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const R = secp.Point.fromHex(sig.R);
  const X = secp.Point.fromHex(groupPubkey);
  const z = hexToBig(sig.z);
  const c = Hn(utf8ToBytes("rotate-chal"), msg, hexToBytes(groupPubkey));
  return G.multiply(z).equals(R.add(X.multiply(c)));
};

const parseJSONCandidate = (raw) => {
  try {
    let candidate = raw;
    if (typeof candidate !== "string" && typeof candidate !== "object") return null;
    if (typeof candidate === "string") {
      const s = candidate.trim();
      try {
        candidate = JSON.parse(s);
      } catch {
        const start = s.indexOf("{");
        const end = s.lastIndexOf("}");
        if (start >= 0 && end > start) candidate = JSON.parse(s.slice(start, end + 1));
        else return null;
      }
    }
    return candidate;
  } catch {
    return null;
  }
};

export const deriveGuardianSecretProof = ({
  sharedSecret,
  req_id,
  nonce,
  group_id,
  old_npub,
  guardian_id,
}) => {
  if (!sharedSecret || !req_id || !nonce || !guardian_id) return "";
  const scope = group_id || old_npub || "";
  if (!scope) return "";
  return sha256Hex(`${sharedSecret}|${req_id}|${nonce}|${scope}|${guardian_id}`);
};

export const buildRotationAttestationV2 = ({ req, setup, share }) => {
  if (!req?.req_id || !req?.new_npub || !req?.nonce) throw new Error("invalid request");
  if (!setup?.group_id || !setup?.owner_old_npub) throw new Error("invalid setup");
  const partial = buildRotationPartial(
    {
      old_npub: setup.owner_old_npub,
      new_npub: req.new_npub,
      nonce: req.nonce,
      participant_ids: (req.participant_ids && Array.isArray(req.participant_ids) && req.participant_ids.length >= 2)
        ? req.participant_ids
        : (setup.participant_ids || [1, 2, 3]),
    },
    share,
  );
  return {
    type: "rotation-attestation",
    version: 2,
    req_id: req.req_id,
    record_id: setup.record_id,
    group_id: setup.group_id,
    guardian_id: Number(setup.guardian_id),
    old_npub: setup.owner_old_npub,
    new_npub: req.new_npub,
    nonce: req.nonce,
    partial,
    created_at: Math.floor(Date.now() / 1000),
  };
};

export const parseRotationPartial = (raw) => {
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (j?.type !== "rotation-partial") return null;
    if (!Number.isInteger(j?.partial?.id)) return null;
    return {
      ...j,
      old_npub: (j.old_npub || "").trim(),
      new_npub: (j.new_npub || "").trim(),
      nonce: (j.nonce || "").trim(),
    };
  } catch {
    return null;
  }
};

export const parseGuardianSetupV1 = (raw) => {
  const j = parseJSONCandidate(raw);
  if (!j || j.type !== "guardian-setup" || Number(j.version) !== 1) return null;

  const errors = [];
  const group_id = (j.group_id || "").trim();
  const owner_old_npub = (j.owner_old_npub || "").trim();
  const guardian_npub = (j.guardian_npub || "").trim();
  const group_pubkey = (j.group_pubkey || "").trim();
  const guardian_id = Number(j.guardian_id);

  if (!group_id || !/^g_[0-9a-f]{8,}$/i.test(group_id)) errors.push("group_id must be opaque id like g_<hash>");
  if (!Number.isInteger(guardian_id) || guardian_id < 1) errors.push("guardian_id must be positive integer");
  if (!isNpub(owner_old_npub)) errors.push("owner_old_npub must be npub (bech32)");
  if (!isNpub(guardian_npub)) errors.push("guardian_npub must be npub (bech32)");
  if (group_pubkey && !isHex(group_pubkey, 64)) errors.push("group_pubkey must be hex pubkey when provided");

  const record_id = buildGuardianSetupRecordId({ group_id, guardian_id, owner_old_npub });
  if (j.record_id && j.record_id.trim() !== record_id) {
    errors.push("record_id mismatch (expected deterministic sha256)");
  }

  if (errors.length > 0) {
    console.warn("[guardian-setup] rejected", { errors, payload: j });
    return null;
  }
  if (!group_pubkey) {
    console.warn("[guardian-setup] indexed without group_pubkey", {
      group_id,
      guardian_id,
      owner_old_npub,
    });
  }

  return {
    ...j,
    version: 1,
    type: "guardian-setup",
    record_id,
    group_id,
    guardian_id,
    threshold: Number(j.threshold || 2),
    guardian_count: Number(j.guardian_count || 3),
    owner_old_npub,
    guardian_npub,
    group_pubkey,
    participant_ids: Array.isArray(j.participant_ids) ? j.participant_ids.map(Number) : [1, 2, 3],
    status: j.status || "active",
    updated_at: Number(j.updated_at || j.created_at || Math.floor(Date.now() / 1000)),
    created_at: Number(j.created_at || Math.floor(Date.now() / 1000)),
  };
};

export const parseGuardianSetupUpdateV1 = (raw) => {
  const j = parseJSONCandidate(raw);
  if (!j || j.type !== "guardian-setup-update" || Number(j.version) !== 1) return null;
  if (!j.record_id || !j.group_id || !Number.isInteger(Number(j.guardian_id))) {
    console.warn("[guardian-setup-update] rejected", { reason: "missing required fields", payload: j });
    return null;
  }
  return {
    ...j,
    version: 1,
    type: "guardian-setup-update",
    record_id: (j.record_id || "").trim(),
    group_id: (j.group_id || "").trim(),
    guardian_id: Number(j.guardian_id),
    status: j.status || "active",
    updated_at: Number(j.updated_at || j.created_at || Math.floor(Date.now() / 1000)),
  };
};

export const parseRotationRequestV2 = (raw) => {
  const j = parseJSONCandidate(raw);
  if (!j || j.type !== "rotation-request" || Number(j.version) !== 2) return null;
  if (!j.req_id || !Number.isInteger(Number(j.guardian_id)) || !j.new_npub || !j.secret_proof || !j.nonce) return null;
  const now = Math.floor(Date.now() / 1000);
  const expires = Number(j.expires_at || 0);
  if (expires && expires < now - 300) return null;
  return {
    ...j,
    version: 2,
    type: "rotation-request",
    req_id: (j.req_id || "").trim(),
    group_id: (j.group_id || "").trim(),
    old_npub: (j.old_npub || j.old_npub_hint || "").trim(),
    guardian_id: Number(j.guardian_id),
    participant_ids: Array.isArray(j.participant_ids) ? j.participant_ids.map(Number) : null,
    new_npub: (j.new_npub || "").trim(),
    shared_secret: (j.shared_secret || "").trim(),
    secret_proof: (j.secret_proof || "").trim(),
    nonce: (j.nonce || "").trim(),
    created_at: Number(j.created_at || now),
    expires_at: expires || now + 3600,
  };
};

export const parseRotationRequestV3 = (raw) => {
  const j = parseJSONCandidate(raw);
  if (!j || j.type !== "rotation-request" || Number(j.version) !== 3) return null;
  if (!j.req_id || !Number.isInteger(Number(j.guardian_id)) || !j.new_npub || !j.nonce) return null;
  if (!j.link?.link_id || !j.link?.secret_proof) return null;

  const now = Math.floor(Date.now() / 1000);
  const expires = Number(j.expires_at || 0);
  if (expires && expires < now - 300) return null;

  return {
    ...j,
    version: 3,
    type: "rotation-request",
    req_id: (j.req_id || "").trim(),
    group_id: (j.group_id || "").trim(),
    old_npub: (j.old_npub || j.old_npub_hint || "").trim(),
    guardian_id: Number(j.guardian_id),
    participant_ids: Array.isArray(j.participant_ids) ? j.participant_ids.map(Number) : null,
    new_npub: (j.new_npub || "").trim(),
    nonce: (j.nonce || "").trim(),
    eligibility_cutoff: Number(j.eligibility_cutoff || 0) || 0,
    link: {
      link_id: (j.link?.link_id || "").trim(),
      secret_proof: (j.link?.secret_proof || "").trim(),
    },
    created_at: Number(j.created_at || now),
    expires_at: expires || now + 3600,
  };
};

export const parseRotationAttestationV2 = (raw) => {
  const j = parseJSONCandidate(raw);
  if (!j || j.type !== "rotation-attestation" || Number(j.version) !== 2) return null;
  if (!j.req_id || !j.group_id || !Number.isInteger(Number(j.guardian_id)) || !j.old_npub || !j.new_npub || !j.nonce) return null;
  if (!j.partial?.id || !j.partial?.R_i || !j.partial?.z_i) return null;
  return {
    ...j,
    version: 2,
    type: "rotation-attestation",
    guardian_id: Number(j.guardian_id),
    old_npub: (j.old_npub || "").trim(),
    new_npub: (j.new_npub || "").trim(),
    nonce: (j.nonce || "").trim(),
  };
};

// Secret share provisioning (sent requester -> guardian via NIP-17 DM)
export const parseGuardianShareV1 = (raw) => {
  const j = parseJSONCandidate(raw);
  if (!j || j.type !== "guardian-share" || Number(j.version) !== 1) return null;
  if (!j.group_id || !Number.isInteger(Number(j.guardian_id)) || !j.group_pubkey || !j.share) return null;
  const group_id = (j.group_id || "").trim();
  const guardian_id = Number(j.guardian_id);
  const group_pubkey = (j.group_pubkey || "").trim();
  const share = (j.share || "").trim();
  if (!/^g_[0-9a-f]{8,}$/i.test(group_id)) return null;
  if (!isHex(group_pubkey, 64) && !isHex(group_pubkey, 66)) {
    // allow compressed pubkey hex (33 bytes => 66 hex)
    return null;
  }
  if (!isHex(share, 64)) return null;

  return {
    ...j,
    version: 1,
    type: "guardian-share",
    group_id,
    guardian_id,
    group_pubkey,
    share,
  };
};

export const parseRotationRequest = (raw) => {
  const v3 = parseRotationRequestV3(raw);
  if (v3) return v3;
  const v2 = parseRotationRequestV2(raw);
  if (v2) return v2;
  try {
    const candidate = parseJSONCandidate(raw);
    if (candidate?.type !== "rotation-request") return null;
    return {
      ...candidate,
      old_npub: (candidate.old_npub || "").trim(),
      new_npub: (candidate.new_npub || "").trim(),
      nonce: (candidate.nonce || "").trim(),
      version: Number(candidate.version || 1),
    };
  } catch {
    return null;
  }
};