import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const n = secp256k1.CURVE.n;
const G = secp256k1.ProjectivePoint.BASE;

const mod = (x) => ((x % n) + n) % n;
const b2n = (b) => BigInt('0x' + bytesToHex(b));
const n2b = (x) => hexToBytes(mod(x).toString(16).padStart(64, '0'));

const Hn = (...parts) => mod(b2n(sha256(concatBytes(...parts))));

export function rotateMsgHash(oldNpub, newNpub, nonce) {
  return sha256(utf8ToBytes(`rotate|${oldNpub}|${newNpub}|${nonce}`));
}

export function dealerCreate2of3() {
  const x = mod(b2n(secp256k1.utils.randomPrivateKey()));
  const a1 = mod(b2n(secp256k1.utils.randomPrivateKey()));
  const shares = [1, 2, 3].map((id) => ({ id, share: mod(x + a1 * BigInt(id)) }));
  return { groupSecret: x, groupPubkey: bytesToHex(G.multiply(x).toRawBytes(true)), shares, threshold: 2 };
}

export function lagrangeCoef(id, ids) {
  const xi = BigInt(id);
  let num = 1n;
  let den = 1n;
  for (const j of ids) {
    if (j === id) continue;
    const xj = BigInt(j);
    num = mod(num * -xj);
    den = mod(den * (xi - xj));
  }
  return mod(num * secp256k1.utils.invert(den, n));
}

export function partialSign(req, guardianShare, participantIds, groupPubkeyHex) {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const x_i = BigInt('0x' + guardianShare.share);
  const id = guardianShare.id;
  const k_i = Hn(utf8ToBytes('nonce'), n2b(x_i), utf8ToBytes(req.nonce));
  const R_i = G.multiply(k_i);
  const participantSet = participantIds.map(Number);
  const lambda = lagrangeCoef(id, participantSet);
  const c = Hn(utf8ToBytes('rotate-chal'), msg, hexToBytes(groupPubkeyHex));
  const z_i = mod(k_i + c * lambda * x_i);
  return {
    id,
    R_i: bytesToHex(R_i.toRawBytes(true)),
    z_i: z_i.toString(16).padStart(64, '0'),
  };
}

export function aggregate(req, partials, groupPubkeyHex) {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const R = partials
    .map((p) => secp256k1.ProjectivePoint.fromHex(p.R_i))
    .reduce((a, b) => a.add(b), secp256k1.ProjectivePoint.ZERO);
  const z = partials.reduce((a, p) => mod(a + BigInt('0x' + p.z_i)), 0n);
  const c = Hn(utf8ToBytes('rotate-chal'), msg, hexToBytes(groupPubkeyHex));
  return {
    R: bytesToHex(R.toRawBytes(true)),
    z: z.toString(16).padStart(64, '0'),
    c: c.toString(16),
  };
}

export function verifyAggregate(req, proof, groupPubkeyHex) {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const R = secp256k1.ProjectivePoint.fromHex(proof.R);
  const X = secp256k1.ProjectivePoint.fromHex(groupPubkeyHex);
  const z = BigInt('0x' + proof.z);
  const c = Hn(utf8ToBytes('rotate-chal'), msg, hexToBytes(groupPubkeyHex));
  const left = G.multiply(z);
  const right = R.add(X.multiply(c));
  return left.equals(right);
}
