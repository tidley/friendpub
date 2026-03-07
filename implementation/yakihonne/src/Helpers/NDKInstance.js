import NDK from "@nostr-dev-kit/ndk";
import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";
import { relaysOnPlatform } from "@/Content/Relays";
import { normalizeRelayList, normalizeRelayUrl } from "@/Helpers/relayUtils";
import bannedList from "@/Content/BannedList";

const ndkInstance = new NDK({
  explicitRelayUrls: normalizeRelayList(relaysOnPlatform),
  enableOutboxModel: true,
  muteFilter: (event) => {
    if (bannedList.includes(event.pubkey)) return true;
    return false;
  },
  // mutedIds: new Map([bannedList.map((p) => [p, "p"])]),
});

await ndkInstance.connect(1000);
if (typeof window !== "undefined") {
  ndkInstance.cacheAdapter = new NDKCacheAdapterDexie({
    dbName: "ndk-store",
    expirationTime: 3600 * 24 * 7,
    profileCacheSize: 200,
  });
}

export { ndkInstance };

export const addExplicitRelays = (relayList) => {
  try {
    const normalized = normalizeRelayList(relayList);
    if (!normalized.length) return;
    const existing = new Set((ndkInstance.explicitRelayUrls || []).map(normalizeRelayUrl));
    const toAdd = normalized.filter((r) => !existing.has(r));
    if (!toAdd.length) return;
    for (let relay of toAdd) {
      ndkInstance.addExplicitRelay(relay, undefined, true);
    }
  } catch (err) {
    console.log(err);
  }
};
