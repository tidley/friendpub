import React from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getEventStatAfterEOSE,
  updateYakiChestStats,
} from "@/Helpers/Controlers";
import { saveEventStats } from "@/Helpers/DB";
import { checkForLUDS, getZapper } from "@/Helpers/Encryptions";
import ZapTip from "@/Components/ZapTip";
import { ndkInstance } from "@/Helpers/NDKInstance";
import axiosInstance from "@/Helpers/HTTP_Client";
import { safeUpdateYakiChest } from "@/Helpers/yakiChest";
import { setUpdatedActionFromYakiChest } from "@/Store/Slides/YakiChest";

export default function Zap({ event, user, actions, isZapped }) {
  const dispatch = useDispatch();
  const userMetadata = useSelector((state) => state.userMetadata);

  const reactToNote = async (filter) => {
    let event_ = await getEvent(filter);
    let zapper = getZapper(event_);
    let amount = zapper.amount;
    let content = zapper.message;
    let stats = getEventStatAfterEOSE(
      zapper,
      "zaps",
      actions,
      { amount, content },
      event_.created_at
    );
    saveEventStats(event.aTag || event.id, stats);
    updateYakiChest(amount);
  };

  const getEvent = async (filter) => {
    return new Promise((resolve) => {
      let sub = ndkInstance.subscribe(filter, {
        groupable: false,
        cacheUsage: "ONLY_RELAY",
      });
      sub.on("event", (event) => {
        resolve(event.rawEvent());
        sub.stop();
      });
    });
  };

  const updateYakiChest = async (amount) => {
    const action_key = getActionKey(amount);
    if (action_key) await safeUpdateYakiChest(action_key);
  };

  const getActionKey = (amount) => {
    if (amount > 0 && amount <= 20) return "zap-1";
    if (amount <= 60) return "zap-20";
    if (amount <= 100) return "zap-60";
    if (amount > 100) return "zap-100";
    return false;
  };

  return (
    <ZapTip
      recipientLNURL={checkForLUDS(user.lud06, user.lud16)}
      recipientPubkey={event.pubkey}
      senderPubkey={userMetadata?.pubkey}
      recipientInfo={{
        name: user.name,
        picture: user.picture,
      }}
      eTag={event.aTag ? "" : event.id}
      aTag={event.aTag ? event.aTag : ""}
      forContent={
        event.title
          ? event.title.substring(0, 40)
          : event.content.substring(0, 40)
      }
      onlyIcon={true}
      setReceivedEvent={reactToNote}
      isZapped={isZapped}
    />
  );
}
