import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";

const STORAGE_KEY = "friendpub-link-index-v1";

const toHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

const sha256Hex = (s) => toHex(sha256(utf8ToBytes(s)));

export const sortTwo = (a, b) => {
  const aa = String(a || "").trim();
  const bb = String(b || "").trim();
  return aa < bb ? [aa, bb] : [bb, aa];
};

export const buildLinkIdV1 = ({ a_npub, b_npub, salt_a, salt_b }) => {
  const [x, y] = sortTwo(a_npub, b_npub);
  const sa = String(salt_a || "").trim();
  const sb = String(salt_b || "").trim();
  // salts are both required
  if (!sa || !sb) return "";
  return sha256Hex(`friendpub-link:v1|${x}|${y}|${sa}|${sb}`);
};

export const deriveSharedSecretV1 = ({ a_npub, b_npub, salt_a, salt_b }) => {
  const [x, y] = sortTwo(a_npub, b_npub);
  const sa = String(salt_a || "").trim();
  const sb = String(salt_b || "").trim();
  if (!sa || !sb) return "";
  return sha256Hex(`friendpub-secret:v1|${x}|${y}|${sa}|${sb}`);
};

export const buildSecretProofV1 = ({ sharedSecret, req_id, nonce, old_npub, new_npub, guardian_id }) => {
  const ss = String(sharedSecret || "").trim();
  if (!ss) return "";
  return sha256Hex(
    `friendpub-proof:v1|${ss}|${String(req_id || "").trim()}|${String(nonce || "").trim()}|${String(old_npub || "").trim()}|${String(new_npub || "").trim()}|${Number(guardian_id)}`,
  );
};

export const loadLinkIndex = () => {
  if (typeof window === "undefined") return { byPeer: {}, updated_at: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { byPeer: {}, updated_at: 0 };
  } catch {
    return { byPeer: {}, updated_at: 0 };
  }
};

export const saveLinkIndex = (idx) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(idx || { byPeer: {}, updated_at: 0 }));
  } catch (e) {
    console.warn("[friendpub-link] persist failed", e?.name || e?.message || e);
  }
};

// Stores salts and derived shared secret per peer.
// Keyed by `${owner_npub}|${peer_npub}` to avoid ambiguity.
export const upsertLinkSalt = ({ owner_npub, peer_npub, salt_from_owner, salt_from_peer }) => {
  const o = String(owner_npub || "").trim();
  const p = String(peer_npub || "").trim();
  if (!o || !p) return null;

  const idx = loadLinkIndex();
  const key = `${o}|${p}`;
  const prev = idx.byPeer?.[key] || {};

  const next = {
    owner_npub: o,
    peer_npub: p,
    salt_from_owner: String(salt_from_owner || prev.salt_from_owner || "").trim(),
    salt_from_peer: String(salt_from_peer || prev.salt_from_peer || "").trim(),
  };

  const link_id = buildLinkIdV1({ a_npub: o, b_npub: p, salt_a: next.salt_from_owner, salt_b: next.salt_from_peer });
  const shared_secret = deriveSharedSecretV1({ a_npub: o, b_npub: p, salt_a: next.salt_from_owner, salt_b: next.salt_from_peer });

  idx.byPeer = idx.byPeer || {};
  idx.byPeer[key] = { ...next, link_id, shared_secret, updated_at: Math.floor(Date.now() / 1000) };
  idx.updated_at = Math.floor(Date.now() / 1000);
  saveLinkIndex(idx);
  return idx.byPeer[key];
};

export const getLinkFor = ({ owner_npub, peer_npub }) => {
  const o = String(owner_npub || "").trim();
  const p = String(peer_npub || "").trim();
  if (!o || !p) return null;
  const idx = loadLinkIndex();
  return idx.byPeer?.[`${o}|${p}`] || null;
};
