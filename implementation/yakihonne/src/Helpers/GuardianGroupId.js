import { nip19 } from "nostr-tools";
import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

const sha256Hex = (s) => secp.etc.bytesToHex(sha256(utf8ToBytes(s)));

export const npubToPubkeyHex = (npub) => {
  try {
    const decoded = nip19.decode((npub || "").trim());
    if (decoded?.type !== "npub") return "";
    return String(decoded.data || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

export const normalizeGuardianPubkeysHex = (guardian_npubs) => {
  const pubkeys = (Array.isArray(guardian_npubs) ? guardian_npubs : [])
    .map(npubToPubkeyHex)
    .filter(Boolean);
  pubkeys.sort();
  return pubkeys;
};

// Deterministic group_id (Option B): derived solely from guardian set + threshold.
// Stable under guardian input order by sorting canonical pubkeys.
export const computeDeterministicGroupId = ({ threshold, guardian_npubs }) => {
  const t = Number(threshold);
  const pubkeys = normalizeGuardianPubkeysHex(guardian_npubs);
  if (!Number.isInteger(t) || t < 1) return "";
  if (pubkeys.length < 1) return "";
  if (t > pubkeys.length) return "";

  const preimage = `guardian-setup:v1|${t}|${pubkeys.join(",")}`;
  return `g_${sha256Hex(preimage)}`;
};
