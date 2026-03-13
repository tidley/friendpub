import { upsertLinkSalt } from "@/Helpers/FriendpubLink";

const messageIdFor = (msg) => msg?.giftWrapId || msg?.id || `${msg?.created_at || 0}:${msg?.pubkey || ""}`;

// Ingest friendpub-link DMs from chatrooms and persist salts/shared secret.
export const ingestFriendpubLinksFromChatrooms = (chatrooms = [], myNpub) => {
  const mine = String(myNpub || "").trim();
  if (!mine) return;

  for (const room of chatrooms || []) {
    for (const msg of room?.convo || []) {
      const raw = msg?.raw_content || msg?.content;
      if (typeof raw !== "string") continue;
      if (!(raw.includes('"type":"friendpub-link"') || raw.includes('"type": "friendpub-link"'))) continue;

      let j = null;
      try { j = JSON.parse(raw); } catch { j = null; }
      if (!j || j.type !== "friendpub-link" || Number(j.version) !== 1) continue;

      const owner_npub = String(j.owner_npub || "").trim();
      const peer_npub = String(j.peer_npub || "").trim();
      const salt = String(j.salt || "").trim();
      if (!owner_npub || !peer_npub || !salt) continue;

      // Determine whether this salt came from me or from the peer.
      // The message author is implicit via DM direction; we just use content and my identity.
      if (mine === owner_npub) {
        // This is my namespace: I am owner in this pair.
        // Salt in the payload belongs to the sender (owner_npub). If I sent it, it's salt_from_owner.
        // If peer sent it (with owner_npub set to peer), it'll be handled in the other branch.
        upsertLinkSalt({ owner_npub, peer_npub, salt_from_owner: salt });
      } else if (mine === peer_npub) {
        // I am the peer in this pair. Store as salt_from_peer (because it came from the other side's "owner").
        upsertLinkSalt({ owner_npub: peer_npub, peer_npub: owner_npub, salt_from_peer: salt });
      } else {
        // Not for me.
        continue;
      }

      // no dedupe map yet; relies on upsert idempotence
      void messageIdFor(msg);
    }
  }
};
