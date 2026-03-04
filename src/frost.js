import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const G = secp.Point.BASE;

const mod = (x) => ((x % n) + n) % n;
const hexToBig = (h) => BigInt('0x' + h);
const bytesToHex = (b) => secp.etc.bytesToHex(b);
const hexToBytes = (h) => secp.etc.hexToBytes(h);
const numTo32b = (x) => secp.etc.numberToBytesBE(mod(x), 32);

const Hn = (...parts) => mod(secp.etc.bytesToNumberBE(sha256(secp.etc.concatBytes(...parts))));

export function rotateMsgHash(oldNpub, newNpub, nonce) {
  return sha256(utf8ToBytes(`rotate|${oldNpub}|${newNpub}|${nonce}`));
}

export function dealerCreate2of3() {
  const x = mod(secp.etc.secretKeyToScalar(secp.utils.randomSecretKey()));
  const a1 = mod(secp.etc.secretKeyToScalar(secp.utils.randomSecretKey()));
  const shares = [1, 2, 3].map((id) => ({ id, share: mod(x + a1 * BigInt(id)) }));
  return { groupSecret: x, groupPubkey: G.multiply(x).toHex(true), shares, threshold: 2 };
}

export function lagrangeCoef(id, ids) {
  const xi = BigInt(id);
  let num = 1n, den = 1n;
  for (const j of ids) {
    if (j === id) continue;
    const xj = BigInt(j);
    num = mod(num * -xj);
    den = mod(den * (xi - xj));
  }
  return mod(num * secp.etc.invert(den, n));
}

export function partialSign(req, guardianShare, participantIds, groupPubkeyHex) {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const x_i = hexToBig(guardianShare.share);
  const id = guardianShare.id;
  const participantSet = participantIds.map(Number);
  const lambda = lagrangeCoef(id, participantSet);

  const k_i = Hn(utf8ToBytes('nonce'), numTo32b(x_i), utf8ToBytes(req.nonce));
  const R_i = G.multiply(k_i);
  const c = Hn(utf8ToBytes('rotate-chal'), msg, hexToBytes(groupPubkeyHex));
  const z_i = mod(k_i + c * lambda * x_i);

  return { id, R_i: R_i.toHex(true), z_i: z_i.toString(16).padStart(64, '0') };
}

export function aggregate(req, partials, groupPubkeyHex) {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const R = partials.map((p) => secp.Point.fromHex(p.R_i)).reduce((a, b) => a.add(b), secp.Point.ZERO);
  const z = partials.reduce((a, p) => mod(a + hexToBig(p.z_i)), 0n);
  const c = Hn(utf8ToBytes('rotate-chal'), msg, hexToBytes(groupPubkeyHex));
  return { R: R.toHex(true), z: z.toString(16).padStart(64, '0'), c: c.toString(16) };
}

export function verifyAggregate(req, proof, groupPubkeyHex) {
  const msg = rotateMsgHash(req.old_npub, req.new_npub, req.nonce);
  const R = secp.Point.fromHex(proof.R);
  const X = secp.Point.fromHex(groupPubkeyHex);
  const z = hexToBig(proof.z);
  const c = Hn(utf8ToBytes('rotate-chal'), msg, hexToBytes(groupPubkeyHex));
  return G.multiply(z).equals(R.add(X.multiply(c)));
}
