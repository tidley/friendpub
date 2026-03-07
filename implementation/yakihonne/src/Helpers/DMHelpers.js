import {
  generateSecretKey,
  finalizeEvent,
  getEventHash,
  nip44,
} from "nostr-tools";
import { bytesTohex, encrypt04, encrypt44 } from "./Encryptions";
import { InitEvent } from "./Controlers";
import { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { store } from "@/Store/Store";
import { setToast, setToPublish } from "@/Store/Slides/Publishers";
import { t } from "i18next";
import { checkCurrentConvo, getInboxRelaysForUser, removeMessage } from "./DB";
import { dmRelaysOnPlatform, relaysOnPlatform } from "@/Content/Relays";
import { getKeys } from "./ClientHelpers";
import { getNDKInstanceForDMs } from "./utils/ndkInstancesForDMsCache";
import { normalizeRelayList, normalizeRelayUrl } from "./relayUtils";
import { safeUpdateYakiChest } from "./yakiChest";

export const sendMessage = async (selectedPerson, message, replyOn) => {
  let userKeys = getKeys();
  let legacy =
    userKeys?.sec || window?.nostr?.nip44
      ? localStorage.getItem("legacy-dm")
      : true;
  if (
    !message ||
    !userKeys ||
    !selectedPerson ||
    (userKeys && !(userKeys.ext || userKeys.sec || userKeys.bunker))
  )
    return;
  let userInboxRelays = store.getState().userInboxRelays;
  let otherPartyRelays = await getInboxRelaysForUser(selectedPerson);
  // For NIP-17 DMs we want at least one NIP-17-capable relay in the mix.
  // We still include user inbox relays and other party inbox relays when available.
  let relaysToPublish = normalizeRelayList([
    ...userInboxRelays,
    ...(otherPartyRelays.length > 0 ? otherPartyRelays : relaysOnPlatform),
    ...dmRelaysOnPlatform,
  ]);

  if (legacy) {
    let encryptedMessage = await encrypt04(userKeys, selectedPerson, message);
    if (!encryptedMessage) {
      return false;
    }
    let tags = [];
    tags.push(["p", selectedPerson]);
    if (replyOn) {
      tags.push(["e", replyOn]);
    }

    let created_at = Math.floor(Date.now() / 1000);
    let tempEvent = {
      created_at,
      kind: 4,
      content: encryptedMessage,
      tags,
    };
    tempEvent = await InitEvent(
      tempEvent.kind,
      tempEvent.content,
      tempEvent.tags,
      tempEvent.created_at,
    );
    if (!tempEvent) return;
    store.dispatch(
      setToPublish({
        eventInitEx: tempEvent,
        allRelays: relaysToPublish,
      }),
    );
    return true;
  }
  if (!legacy) {
    let { sender_event, receiver_event } = await getGiftWrap(
      selectedPerson,
      userKeys,
      message,
      replyOn,
    );

    if (!(sender_event && receiver_event)) return false;

    let response = await initPublishing(
      `${userKeys.pub}:${selectedPerson}`,
      relaysToPublish,
      sender_event,
      receiver_event,
    );
    if (response) {
      let action_key =
        selectedPerson ===
        "20986fb83e775d96d188ca5c9df10ce6d613e0eb7e5768a0f0b12b37cdac21b3"
          ? "dms-10"
          : "dms-5";
      safeUpdateYakiChest(action_key);
      return true;
    } else {
      return false;
    }
  }
};

export const deleteMessage = async ({ ids, pubkey }) => {
  let userKeys = getKeys();
  let convoId = `${pubkey},${userKeys.pub}`;
  let userInboxRelays = store.getState().userInboxRelays;
  let otherPartyRelays = await getInboxRelaysForUser(pubkey);
  let relaysToPublish = [
    ...new Set([...userInboxRelays, ...relaysOnPlatform, ...otherPartyRelays]),
  ];

  let created_at = Math.floor(Date.now() / 1000);
  let tempEvent = {
    created_at,
    kind: 5,
    content: "Delete message",
    tags: ids.map((id) => ["e", id]),
  };
  tempEvent = await InitEvent(
    tempEvent.kind,
    tempEvent.content,
    tempEvent.tags,
    tempEvent.created_at,
  );
  if (!tempEvent) return;
  await removeMessage({ ids, convoId });
  store.dispatch(
    setToPublish({
      eventInitEx: tempEvent,
      allRelays: relaysToPublish,
    }),
  );
  return true;
};

const getGiftWrap = async (selectedPerson, userKeys, message, replyOn) => {
  try {
    let g_sk_1 = generateSecretKey();
    let g_sk_2 = generateSecretKey();
    let [signedKind13_1, signedKind13_2] = await Promise.all([
      getEventKind13(
        selectedPerson,
        userKeys,
        selectedPerson,
        message,
        replyOn,
      ),
      getEventKind13(userKeys.pub, userKeys, selectedPerson, message, replyOn),
    ]);

    if (!(signedKind13_1 && signedKind13_2)) return false;

    let content_1 = nip44.v2.encrypt(
      JSON.stringify(signedKind13_1),
      nip44.v2.utils.getConversationKey(g_sk_1, selectedPerson),
    );
    let content_2 = nip44.v2.encrypt(
      JSON.stringify(signedKind13_2),
      nip44.v2.utils.getConversationKey(g_sk_2, userKeys.pub),
    );
    let event_1 = {
      created_at: getRandomizedTimestamp(),
      kind: 1059,
      tags: [["p", selectedPerson]],
      content: content_1,
    };
    let event_2 = {
      created_at: getRandomizedTimestamp(),
      kind: 1059,
      tags: [["p", userKeys.pub]],
      content: content_2,
    };
    event_1 = finalizeEvent(event_1, g_sk_1);
    event_2 = finalizeEvent(event_2, g_sk_2);
    return { sender_event: event_2, receiver_event: event_1 };
  } catch (err) {
    console.log(err.message);
    return { sender_event: undefined, receiver_event: undefined };
  }
};

const getEventKind14 = (selectedPerson, userKeys, message, replyOn) => {
  let event = {
    pubkey: userKeys.pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 14,
    tags: [
      ["p", selectedPerson],
      ["p", userKeys.pub],
      ...(replyOn ? [["e", replyOn]] : []),
    ],
    content: message,
  };

  event.id = getEventHash(event);
  return event;
};

const getEventKind13 = async (
  pubkey,
  userKeys,
  selectedPerson,
  message,
  replyOn,
) => {
  let unsignedKind14 = getEventKind14(
    selectedPerson,
    userKeys,
    message,
    replyOn,
  );
  let content = await encrypt44(
    userKeys,
    pubkey,
    JSON.stringify(unsignedKind14),
  );

  if (!content) return false;

  let event = {
    created_at: getRandomizedTimestamp(),
    kind: 13,
    tags: [],
    content,
  };
  event = await InitEvent(
    event.kind,
    event.content,
    event.tags,
    event.created_at,
  );
  return event;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRetriablePublishError = (err) => {
  const msg = `${err?.message || err}`.toLowerCase();
  return (
    err?.name === "NDKPublishError" ||
    msg.includes("not enough relays") ||
    msg.includes("connection refused") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("relay not found in pool") ||
    msg.includes("websocket")
  );
};

// Ensure relays are in the pool and connected before publish.
const buildRelaySetForPublish = (ndk, relayUrls) => {
  const urls = normalizeRelayList(relayUrls);
  urls.forEach((url) => {
    const u = normalizeRelayUrl(url);
    // addExplicitRelay is idempotent-ish: pool will keep the first instance per URL.
    if (!ndk.pool?.relays?.has?.(u)) ndk.addExplicitRelay(u);
  });
  return NDKRelaySet.fromRelayUrls(urls, ndk, true);
};

export const preflightDMRelayConnection = async (name, relays) => {
  const ndkInstanceForDM = await getNDKInstanceForDMs(name, relays);
  buildRelaySetForPublish(ndkInstanceForDM, relays);
  const connected = ndkInstanceForDM.pool?.connectedRelays?.() || [];
  return connected.length;
};

const initPublishing = async (name, relays, event1, event2) => {
  try {
    const ndkInstanceForDM = await getNDKInstanceForDMs(name, relays);
    const relaySet = buildRelaySetForPublish(ndkInstanceForDM, relays);

    // Preflight: abort early if we have no connected relays.
    const connected = ndkInstanceForDM.pool?.connectedRelays?.() || [];
    if (!connected.length) {
      store.dispatch(
        setToast({
          type: 2,
          desc:
            "No DM relays are connected. Check relay URLs / network and try again.",
        }),
      );
      return false;
    }

    const ev1 = new NDKEvent(ndkInstanceForDM, event1);
    const ev2 = new NDKEvent(ndkInstanceForDM, event2);

    const backoffs = [250, 1000, 3000];

    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      try {
        const [res1, res2] = await Promise.all([
          ev1.publish(relaySet, 5000, 1),
          ev2.publish(relaySet, 5000, 1),
        ]);

        if (!(res1?.size > 0 && res2?.size > 0)) {
          throw new Error(
            `DM publish incomplete (sender:${res1?.size || 0}, receiver:${res2?.size || 0})`,
          );
        }

        store.dispatch(
          setToast({
            type: 1,
            desc: t("Ax4F7eu"),
          }),
        );

        return true;
      } catch (err) {
        const canRetry = attempt < backoffs.length && isRetriablePublishError(err);
        if (!canRetry) throw err;
        await sleep(backoffs[attempt]);
      }
    }

    return false;
  } catch (err) {
    console.log(err);
    store.dispatch(
      setToast({
        type: 2,
        desc: t("A4cCSy5"),
      }),
    );
    return false;
  }
};


export const handleUpdateConversation = (event) => {
  const userKeys = getKeys();
  if (event.checked) return;
  let tempEvent = {
    pubkey: event.pubkey,
    convo: event.convo,
    id: event.id,
    last_message: event.last_message,
    checked: true,
  };
  checkCurrentConvo(tempEvent, userKeys.pub);
};

const getRandomizedTimestamp = () => {
  let randomTimestamp =
    Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800);
  return randomTimestamp;
};
