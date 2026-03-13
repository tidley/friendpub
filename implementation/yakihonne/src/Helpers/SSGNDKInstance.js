import NDK from "@nostr-dev-kit/ndk";
import { SSGRelays, searchRelays } from "@/Content/Relays";
import { normalizeRelayList, normalizeRelayUrl } from "@/Helpers/relayUtils";
let ssgInstance;
let searchInstance;

export function getSSGNdkInstance(extRelays = []) {
  if (!ssgInstance) {
    ssgInstance = new NDK({
      explicitRelayUrls: normalizeRelayList([...SSGRelays, ...extRelays]),
    });
    ssgInstance.connect(2000).catch(() => {
      console.warn("[NDK] relay connection failed (SSG ssgInstance)");
    });
  }
  if (extRelays.length > 0 && Array.isArray(extRelays)) {
    const normalized = normalizeRelayList(extRelays);
    let tempRelayList = normalized.filter(
      (relay) =>
        !ssgInstance.explicitRelayUrls
          .map(normalizeRelayUrl)
          .includes(`${relay}`),
    );
    if (tempRelayList.length > 0)
      for (let relay of tempRelayList) {
        ssgInstance.addExplicitRelay(relay, undefined, true);
      }
  }
  if (ssgInstance.pool.status === "idle") {
    ssgInstance.connect(2000).catch(() => {
      console.warn("[NDK] relay connection failed (SSG ssgInstance)");
    });
  }
  return ssgInstance;
}

export function getSearchNdkInstance(extRelays = []) {
  if (!searchInstance) {
    searchInstance = new NDK({
      explicitRelayUrls: normalizeRelayList([...searchRelays, ...extRelays]),
    });
    searchInstance.connect(2000).catch(() => {
      console.warn("[NDK] relay connection failed (SSG searchInstance)");
    });
  }
  if (extRelays.length > 0 && Array.isArray(extRelays)) {
    const normalized = normalizeRelayList(extRelays);
    let tempRelayList = normalized.filter(
      (relay) =>
        !searchInstance.explicitRelayUrls
          .map(normalizeRelayUrl)
          .includes(`${relay}`),
    );
    if (tempRelayList.length > 0)
      for (let relay of tempRelayList) {
        searchInstance.addExplicitRelay(relay, undefined, true);
      }
  }
  if (searchInstance.pool.status === "idle") {
    console.log(searchInstance.pool.status);
    searchInstance.connect(2000).catch(() => {
      console.warn("[NDK] relay connection failed (SSG searchInstance)");
    });
  }
  return searchInstance;
}
