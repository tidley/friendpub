import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, nip17, nip19 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export const ROTATION_PROOF_KIND = 39089;

export const toHex = (nsecOrHex) => {
  if (!nsecOrHex) return null;
  if (nsecOrHex.length === 64) return nsecOrHex;
  const d = nip19.decode(nsecOrHex);
  return bytesToHex(d.data);
};

export function genKeyPair() {
  const sk = generateSecretKey();
  const hex = bytesToHex(sk);
  const pub = getPublicKey(sk);
  return { skHex: hex, pubHex: pub, nsec: nip19.nsecEncode(sk), npub: nip19.npubEncode(pub) };
}

const pool = new SimplePool();

export async function publishEvent(relays, ev) {
  const pubs = pool.publish(relays, ev);
  await Promise.allSettled(pubs);
}

export async function sendNip17DM(relays, senderSkHex, recipientPubHex, obj) {
  const sk = hexToBytes(senderSkHex);
  const wrapped = nip17.wrapEvent(sk, { publicKey: recipientPubHex }, JSON.stringify(obj));
  await publishEvent(relays, wrapped);
  return wrapped.id;
}

export async function fetchNip17Inbox(relays, mySkHex, myPubHex, sinceSec = 0) {
  const evs = await pool.querySync(relays, { kinds: [1059], '#p': [myPubHex], since: sinceSec || undefined, limit: 200 });
  const sk = hexToBytes(mySkHex);
  const out = [];
  for (const e of evs) {
    try {
      const rum = nip17.unwrapEvent(e, sk);
      out.push({ wrap: e, rumor: rum, json: JSON.parse(rum.content) });
    } catch {}
  }
  return out;
}

export function signEvent(skHex, template) {
  return finalizeEvent(template, hexToBytes(skHex));
}

export async function publishRotationProof(relays, skHex, payload) {
  const ev = signEvent(skHex, {
    kind: ROTATION_PROOF_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['old', payload.old_npub],
      ['new', payload.new_npub],
      ['nonce', payload.nonce],
      ['gset', payload.guardian_set_hash],
    ],
    content: JSON.stringify(payload),
  });
  await publishEvent(relays, ev);
  return ev;
}

export async function fetchProofs(relays, sinceSec = 0) {
  return pool.querySync(relays, { kinds: [ROTATION_PROOF_KIND], since: sinceSec || undefined, limit: 100 });
}
