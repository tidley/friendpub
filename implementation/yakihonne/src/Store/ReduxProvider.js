import { Provider } from "react-redux";
import { useEffect } from "react";
import { store } from "@/Store/Store";
import { nip19 } from "nostr-tools";
import { setUserChatrooms, setUserInboxRelays, setUserKeys } from "@/Store/Slides/UserData";

export default function ReduxProvider({ children }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NEXT_PUBLIC_E2E !== "1") return;

    // Minimal E2E hook for Playwright tests.
    // Intentionally only enabled behind NEXT_PUBLIC_E2E=1.
    if (!window.__friendpubTest) window.__friendpubTest = {};

    window.__friendpubTest.store = store;

    window.__friendpubTest.setUserPubkeyHex = (pub) => {
      store.dispatch(setUserKeys({ pub }));
    };

    window.__friendpubTest.setUserInboxRelays = (relays) => {
      store.dispatch(setUserInboxRelays(relays));
    };

    // Accepts: [{ from_npub?: string, from_pubkey?: string, created_at?: number, raw: string }]
    // Builds userChatrooms with minimal shape used by /key-rotation-demo.
    window.__friendpubTest.seedRotationAttestations = (messages) => {
      const byFrom = new Map();
      for (const m of messages || []) {
        let from = (m?.from_pubkey || "").trim();
        if (!from && m?.from_npub) {
          try {
            const decoded = nip19.decode(String(m.from_npub).trim());
            if (decoded?.type === "npub") from = decoded.data;
          } catch {
            // ignore
          }
        }
        if (!from) continue;

        const item = {
          created_at: Number(m?.created_at || Math.floor(Date.now() / 1000)),
          raw_content: String(m?.raw || ""),
          content: String(m?.raw || ""),
        };

        const arr = byFrom.get(from) || [];
        arr.push(item);
        byFrom.set(from, arr);
      }

      const chatrooms = Array.from(byFrom.entries()).map(([pubkey, convo]) => ({
        pubkey,
        convo,
      }));

      store.dispatch(setUserChatrooms(chatrooms));
      return chatrooms.length;
    };
  }, []);

  return <Provider store={store}>{children}</Provider>;
}
