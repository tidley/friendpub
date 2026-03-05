import * as secp from "@noble/secp256k1";

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
