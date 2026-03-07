// NOTE: Keep these lists conservative and stable.
// For NIP-17 DMs, use `dmRelaysOnPlatform` (configurable via env).

import { normalizeRelayList } from "@/Helpers/relayUtils";

const relaysOnPlatform = normalizeRelayList([
  "wss://nostr-01.yakihonne.com",
  // removed: wss://nostr-02.yakihonne.com (observed connection refused)
  "wss://relay.damus.io",
  "wss://relay.nsec.app",
  "wss://monitorlizard.nostr1.com",
]);

const SSGRelays = normalizeRelayList([
  "wss://nostr-01.yakihonne.com",
  // removed: wss://nostr-02.yakihonne.com
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
]);

// NIP-17-capable relays (best-effort defaults).
// Override with NEXT_PUBLIC_DM_RELAYS="wss://nip17.com,wss://…".
const DEFAULT_DM_RELAYS = normalizeRelayList([
  "wss://nip17.com",
  // Best-effort defaults; override via env for your deployment.
  "wss://relay.primal.net",
  "wss://relay.nostr.wine",
  "wss://nos.lol",
]);

const parseRelayList = (value) =>
  normalizeRelayList(
    (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const dmRelaysOnPlatform = parseRelayList(process.env.NEXT_PUBLIC_DM_RELAYS)
  .length
  ? parseRelayList(process.env.NEXT_PUBLIC_DM_RELAYS)
  : DEFAULT_DM_RELAYS;

const searchRelays = normalizeRelayList([
  "wss://search.nos.today",
  "wss://relay.ditto.pub",
  "wss://nostr.polyserv.xyz",
]);

export { relaysOnPlatform, dmRelaysOnPlatform, SSGRelays, searchRelays };
