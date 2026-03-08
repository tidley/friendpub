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

// Generic Shamir split of one group secret scalar:
//   f(x) = secret + a1*x + a2*x^2 + ... + a(t-1)*x^(t-1) (mod n)
// Shares: f(id) for each participant id.
export const dealerSplitSecretShamir = ({
  groupSecretHex,
  participantIds = [1, 2, 3],
  threshold = 2,
  coeffHexes,
  secpImpl = secp,
} = {}) => {
  if (!isHex(groupSecretHex, 64)) throw new Error("groupSecretHex must be 32-byte hex");
  const t = Number(threshold || 2);
  if (!Number.isInteger(t) || t < 1) throw new Error("threshold must be a positive integer");

  const ids = (participantIds || []).map(Number).filter((x) => Number.isFinite(x));
  if (!ids.length) throw new Error("participantIds required");
  if (t > ids.length) throw new Error("threshold cannot exceed participant count");

  const secret = BigInt("0x" + groupSecretHex);

  // Degree is (t-1); we need (t-1) random coefficients.
  const want = Math.max(0, t - 1);
  const a = Array.from({ length: want }, (_, i) => {
    const hex = Array.isArray(coeffHexes) ? String(coeffHexes[i] || "").trim() : "";
    return isHex(hex, 64)
      ? BigInt("0x" + hex)
      : bytesToBig(getRandomPrivateKeyBytes(secpImpl), secpImpl);
  });

  const shares = ids.map((id) => {
    const x = BigInt(id);
    // Horner's method: (((a_{t-1}*x + a_{t-2})*x + ... )*x + a1)*x + secret
    let y = 0n;
    for (let i = a.length - 1; i >= 0; i--) y = mod((y * x) + a[i]);
    y = mod((y * x) + secret);

    return {
      id: Number(id),
      share: y.toString(16).padStart(64, "0"),
      threshold: t,
    };
  });

  return {
    threshold: t,
    participantIds: ids,
    coeffHexes: a.map((x) => mod(x).toString(16).padStart(64, "0")),
    shares,
  };
};

// Back-compat helper: 2-of-3 degree-1 Shamir split.
export const dealerSplitSecret2of3 = ({
  groupSecretHex,
  participantIds = [1, 2, 3],
  threshold = 2,
  coeffHex,
  secpImpl = secp,
} = {}) => {
  return dealerSplitSecretShamir({
    groupSecretHex,
    participantIds,
    threshold,
    coeffHexes: coeffHex ? [coeffHex] : undefined,
    secpImpl,
  });
};
