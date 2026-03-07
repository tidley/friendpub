import * as secp from "@noble/secp256k1";

// NOTE: demo-only helpers for "trusted dealer" group secret generation and
// 2-of-3 share provisioning.

const n = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);

const mod = (x) => ((x % n) + n) % n;

const getCrypto = () => {
  if (typeof crypto !== "undefined") return crypto;
  if (typeof globalThis !== "undefined" && globalThis.crypto) return globalThis.crypto;
  return null;
};

export const getRandomPrivateKeyBytes = (secpImpl = secp) => {
  if (secpImpl?.utils?.randomPrivateKey) return secpImpl.utils.randomPrivateKey();
  if (secpImpl?.etc?.randomBytes) return secpImpl?.etc?.randomBytes(32);
  const arr = new Uint8Array(32);
  const cryptoApi = getCrypto();
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(arr);
    return arr;
  }
  throw new Error("No secure random source available");
};

export const deriveCompressedPubkeyHex = (privBytes, secpImpl = secp) => {
  if (secpImpl?.getPublicKey) {
    const out = secpImpl.getPublicKey(privBytes, true);
    return typeof out === "string" ? out : secpImpl.etc.bytesToHex(out);
  }
  if (secpImpl?.Point?.fromPrivateKey)
    return secpImpl.Point.fromPrivateKey(privBytes).toHex(true);
  throw new Error("No secp256k1 pubkey derivation API available");
};

const bytesToBig = (b, secpImpl = secp) => {
  const hex = secpImpl.etc.bytesToHex(b);
  return BigInt("0x" + hex);
};

const isHex = (v, len) =>
  typeof v === "string" && /^[0-9a-f]+$/i.test(v) && (!len || v.length === len);

// Simple Shamir (degree-1) 2-of-3 split of one group secret scalar:
//   f(x) = secret + a1*x (mod n)
// Shares: f(1), f(2), f(3)
export const dealerSplitSecret2of3 = ({
  groupSecretHex,
  participantIds = [1, 2, 3],
  threshold = 2,
  coeffHex,
  secpImpl = secp,
} = {}) => {
  if (!isHex(groupSecretHex, 64)) throw new Error("groupSecretHex must be 32-byte hex");
  const x = BigInt("0x" + groupSecretHex);
  const a1 = isHex(coeffHex, 64)
    ? BigInt("0x" + coeffHex)
    : bytesToBig(getRandomPrivateKeyBytes(secpImpl), secpImpl);

  const shares = (participantIds || [1, 2, 3]).map((id) => {
    const xi = mod(x + a1 * BigInt(Number(id)));
    return {
      id: Number(id),
      share: xi.toString(16).padStart(64, "0"),
      threshold: Number(threshold || 2),
    };
  });

  return {
    threshold: Number(threshold || 2),
    participantIds: (participantIds || [1, 2, 3]).map(Number),
    coeffHex: mod(a1).toString(16).padStart(64, "0"),
    shares,
  };
};
