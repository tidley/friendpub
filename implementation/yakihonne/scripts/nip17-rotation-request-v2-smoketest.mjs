#!/usr/bin/env node

/**
 * NIP-17 DM smoketest (rotation-request v2)
 *
 * Avoids NDK (can be very heavy in Node) and uses nostr-tools Relay directly.
 * Publishes both sender+receiver giftwrap events for 3 recipients and prints
 * publish results per relay.
 *
 * Usage:
 *   TEST_NSEC=<hex|nsec> node scripts/nip17-rotation-request-v2-smoketest.mjs npub1... npub1... npub1...
 *
 * Optional:
 *   NEXT_PUBLIC_DM_RELAYS="wss://nip17.com,wss://relay.primal.net,..."
 */

import {
  Relay,
  nip19,
  generateSecretKey,
  finalizeEvent,
  getPublicKey,
  nip44,
} from "nostr-tools";

import { normalizeRelayList } from "../src/Helpers/relayUtils.js";

const DEFAULT_DM_RELAYS = [
  "wss://nip17.com",
  "wss://relay.primal.net",
  "wss://relay.nostr.wine",
  "wss://nos.lol",
];

const hexToBytes = (hex) => {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2) throw new Error("bad hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const parseSecretKey = (raw) => {
  if (!raw) throw new Error("Missing TEST_NSEC (hex 32b or nsec1…)");
  if (raw.startsWith("nsec1")) {
    const d = nip19.decode(raw);
    if (d.type !== "nsec") throw new Error("TEST_NSEC must be nsec");
    return d.data;
  }
  return hexToBytes(raw);
};

const parseRelayList = (value) =>
  normalizeRelayList(
    (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Provide 3 recipients: npub1… npub1… npub1…");
  process.exit(2);
}

const recipients = args.slice(0, 3).map((npub) => {
  const d = nip19.decode(npub);
  if (d.type !== "npub") throw new Error(`bad npub: ${npub}`);
  return d.data; // hex pubkey
});

const sk = parseSecretKey(process.env.TEST_NSEC);
const pub = getPublicKey(sk);

const relays = parseRelayList(process.env.NEXT_PUBLIC_DM_RELAYS).length
  ? parseRelayList(process.env.NEXT_PUBLIC_DM_RELAYS)
  : normalizeRelayList(DEFAULT_DM_RELAYS);

console.log("Using relays:", relays);

const buildGiftWrapPair = (receiverPubkeyHex, payloadObj) => {
  const created_at = Math.floor(Date.now() / 1000);

  const kind14 = {
    pubkey: pub,
    created_at,
    kind: 14,
    tags: [["p", receiverPubkeyHex], ["p", pub]],
    content: JSON.stringify(payloadObj),
  };

  // kind:13 is nip44-encrypted kind14
  const encForReceiver = nip44.v2.encrypt(
    JSON.stringify(kind14),
    nip44.v2.utils.getConversationKey(sk, receiverPubkeyHex),
  );
  const encForSelf = nip44.v2.encrypt(
    JSON.stringify(kind14),
    nip44.v2.utils.getConversationKey(sk, pub),
  );

  const kind13ForReceiver = finalizeEvent(
    { created_at, kind: 13, tags: [], content: encForReceiver },
    sk,
  );
  const kind13ForSelf = finalizeEvent(
    { created_at, kind: 13, tags: [], content: encForSelf },
    sk,
  );

  // giftwrap kind:1059 encrypted to a random ephemeral key
  const gsk1 = generateSecretKey();
  const gsk2 = generateSecretKey();

  const giftwrapReceiver = finalizeEvent(
    {
      created_at,
      kind: 1059,
      tags: [["p", receiverPubkeyHex]],
      content: nip44.v2.encrypt(
        JSON.stringify(kind13ForReceiver),
        nip44.v2.utils.getConversationKey(gsk1, receiverPubkeyHex),
      ),
    },
    gsk1,
  );

  const giftwrapSelf = finalizeEvent(
    {
      created_at,
      kind: 1059,
      tags: [["p", pub]],
      content: nip44.v2.encrypt(
        JSON.stringify(kind13ForSelf),
        nip44.v2.utils.getConversationKey(gsk2, pub),
      ),
    },
    gsk2,
  );

  return { sender_event: giftwrapSelf, receiver_event: giftwrapReceiver };
};

const payload = {
  type: "rotation-request",
  version: 2,
  // Intentionally minimal payload; app parser accepts omitted group_id in v2.
  group_id: "",
  guardian_npub: nip19.npubEncode(pub),
  created_at: new Date().toISOString(),
};

const connectRelays = async (urls) => {
  const conns = [];
  for (const url of urls) {
    try {
      const r = await Relay.connect(url);
      conns.push(r);
    } catch (e) {
      console.warn("relay connect failed:", url, `${e?.message || e}`);
    }
  }
  return conns;
};

const relaysConnected = await connectRelays(relays);
console.log("Connected:", relaysConnected.map((r) => r.url));
if (!relaysConnected.length) {
  console.error("No connected relays; aborting.");
  process.exit(1);
}

const publishToAnyRelay = async (event) => {
  // Some relays may reject; treat success on any as sufficient.
  const tasks = relaysConnected.map(async (r) => {
    await r.publish(event);
    return r.url;
  });
  return Promise.any(tasks);
};

let ok = 0;
for (const r of recipients) {
  const { sender_event, receiver_event } = buildGiftWrapPair(r, payload);

  const [s1, s2] = await Promise.allSettled([
    publishToAnyRelay(sender_event),
    publishToAnyRelay(receiver_event),
  ]);

  const senderOk = s1.status === "fulfilled";
  const recvOk = s2.status === "fulfilled";

  console.log(
    `recipient=${r.slice(0, 12)}… senderGiftwrap=${senderOk ? "ok" : "fail"} receiverGiftwrap=${recvOk ? "ok" : "fail"}`,
  );

  if (senderOk && recvOk) ok++;
}

for (const r of relaysConnected) r.close();

console.log(`Sent rotation-request v2 giftwrap pairs: ${ok}/${recipients.length}`);
process.exit(ok === recipients.length ? 0 : 1);
