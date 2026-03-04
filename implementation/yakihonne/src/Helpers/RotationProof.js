import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";

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
  const participantIds = req.participant_ids || [1, 2, 3];
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

export const parseRotationRequest = (raw) => {
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (j?.type !== "rotation-request") return null;
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
