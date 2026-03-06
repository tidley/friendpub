import React, { useEffect, useState, useRef } from "react";
import { nip19 } from "nostr-tools";
import UserProfilePic from "@/Components/UserProfilePic";
import Date_ from "@/Components/Date_";
import LoadingDots from "@/Components/LoadingDots";
import UploadFile from "@/Components/UploadFile";
import { useSelector } from "react-redux";
import Emojis from "@/Components/Emojis";
import Gifs from "@/Components/Gifs";
import { useTranslation } from "react-i18next";
import { deleteMessage, sendMessage } from "@/Helpers/DMHelpers";
import OptionsDropdown from "./OptionsDropdown";
import { copyText } from "@/Helpers/Helpers";
import DeleteWarning from "./DeleteWarning";
import {
  buildGuardianGroupIdFromPubkey,
  buildGuardianSetupRecordId,
  buildRotationAttestationV2,
  buildRotationPartial,
  deriveGuardianSecretProof,
  parseRotationAttestationV2,
  parseRotationRequest,
  parseRotationRequestV2,
} from "@/Helpers/RotationProof";
import { getRandomPrivateKeyBytes, deriveCompressedPubkeyHex } from "@/Helpers/GuardianGroup";
import {
  findGuardianSetupsForRequestV2,
  getActiveGuardianSetups,
  ingestGuardianSetupsFromConversation,
} from "@/Helpers/GuardianSetupIndex";

export function ConversationBox({ convo, back, noHeader = false }) {
  let conversationLength = convo.convo.length;
  const userKeys = useSelector((state) => state.userKeys);
  const { t } = useTranslation();
  const convoContainerRef = useRef(null);
  const inputFieldRef = useRef(null);
  const jsonWarnedRef = useRef(new Set());
  const [message, setMessage] = useState("");
  const [legacy, setLegacy] = useState(
    userKeys.sec || window?.nostr?.nip44
      ? localStorage?.getItem("legacy-dm")
      : true,
  );
  const [replyOn, setReplyOn] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [multiDeletion, setMultiDeletion] = useState([]);
  const [showDelete, setShowDelete] = useState(false);
  const [guardianShareJSON, setGuardianShareJSON] = useState("");

  // Guardian secret shares must be stored per (group_id, guardian_id).
  // Storing one global share in localStorage breaks when simulating multiple guardians
  // in the same browser profile.
  const GUARDIAN_SHARE_KEY_LEGACY = "guardian-share-json";
  const GUARDIAN_SHARE_MAP_KEY = "guardian-share-map-v1";
  const [secretInputs, setSecretInputs] = useState({});
  const [setupChoiceByMsg, setSetupChoiceByMsg] = useState({});
  const [expandedMessages, setExpandedMessages] = useState({});
  const [showSetupBuilder, setShowSetupBuilder] = useState(false);
  const [setupDraft, setSetupDraft] = useState({
    threshold: 2,
    guardian_count: 3,
    group_pubkey: "",
  });
  const [setupDraftError, setSetupDraftError] = useState("");
  const GROUP_PAIR_KEY = "guardian-setup-group-pair-v1";
  const GROUP_GUARDIAN_MAP_KEY = "guardian-setup-guardian-map-v1";
  const peerName =
    convo?.display_name?.substring(0, 10) ||
    convo?.name?.substring(0, 10) ||
    convo?.pubkey.substring(0, 10);
  useEffect(() => {
    if (convoContainerRef.current) {
      convoContainerRef.current.scrollTop =
        convoContainerRef.current.scrollHeight;
    }
    setShowProgress(false);
  }, [convo]);

  useEffect(() => {
    if (inputFieldRef.current) {
      inputFieldRef.current.style.height = "20px";
      inputFieldRef.current.style.height = `${inputFieldRef.current.scrollHeight}px`;
      inputFieldRef.current.scrollTop = inputFieldRef.current.scrollHeight;
      inputFieldRef.current.focus();
    }
  }, [message]);

  const protocolTypes = new Set([
    "guardian-setup",
    "guardian-setup-update",
    "rotation-request",
    "rotation-attestation",
  ]);

  const getProtocolTypeFromRaw = (raw) => {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && protocolTypes.has(parsed.type) && parsed.version) return parsed.type;
      return null;
    } catch {
      return null;
    }
  };

  const devJsonAssert = (raw, context) => {
    if (typeof raw !== "string") return;
    const s = raw.trim();
    if (!(s.startsWith("{") && s.endsWith("}"))) return;
    try {
      JSON.parse(s);
    } catch (e) {
      console.warn(`[dm-json] parse failed (${context})`, e?.message, s.slice(0, 300));
    }
  };

  const handleSendMessage = async () => {
    if (!message || !convo.pubkey) return;
    devJsonAssert(message, "send");
    setShowProgress(true);
    await sendMessage(convo.pubkey, message, replyOn?.id);
    setMessage("");
    setReplyOn(false);
  };

  const getReply = (ID) => {
    let msg = convo.convo.find((conv) => conv.id === ID);
    if (!msg) return false;
    return { content: msg.content, self: msg.pubkey === userKeys.pub };
  };

  const handleLegacyDMs = () => {
    if (legacy) {
      localStorage?.removeItem("legacy-dm");
      setLegacy(false);
    } else {
      localStorage?.setItem("legacy-dm", `${Date.now()}`);
      setLegacy(true);
    }
  };

  const safeParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const loadGuardianShareMap = () => {
    if (typeof window === "undefined") return {};
    const raw = localStorage.getItem(GUARDIAN_SHARE_MAP_KEY);
    const parsed = raw ? safeParse(raw, {}) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  };

  const saveGuardianShareMap = (map) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(GUARDIAN_SHARE_MAP_KEY, JSON.stringify(map || {}));
    } catch (e) {
      // Quota handled elsewhere; don't crash here.
      // eslint-disable-next-line no-console
      console.warn("[guardian-share] persist failed", e?.message || e);
    }
  };

  const resolveMyGuardianSlot = () => {
    try {
      if (!userKeys?.pub) return null;
      const myNpub = asTrimmedString(nip19.npubEncode(userKeys.pub));
      const setups = (typeof getActiveGuardianSetups === "function" ? getActiveGuardianSetups() : []) || [];
      const mine = setups
        .filter((s) => asTrimmedString(s?.guardian_npub) === myNpub && asTrimmedString(s?.group_id))
        .sort((a, b) => Number(b?.updated_at || b?.created_at || 0) - Number(a?.updated_at || a?.created_at || 0));
      const chosen = mine[0];
      if (!chosen?.group_id || !chosen?.guardian_id) return null;
      return {
        group_id: asTrimmedString(chosen.group_id),
        guardian_id: Number(chosen.guardian_id),
        group_pubkey: asTrimmedString(chosen.group_pubkey),
      };
    } catch {
      return null;
    }
  };

  const shareMapKeyFor = (group_id, guardian_id) => `${asTrimmedString(group_id)}:${Number(guardian_id)}`;

  const getGuardianShareFor = ({ group_id, guardian_id }) => {
    const map = loadGuardianShareMap();
    const k = shareMapKeyFor(group_id, guardian_id);
    const raw = map?.[k];
    return typeof raw === "string" ? raw : "";
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Prefer per-guardian share map. Fall back to legacy single-slot storage.
    const slot = resolveMyGuardianSlot();
    const mapValue = slot ? getGuardianShareFor(slot) : "";
    if (mapValue) {
      setGuardianShareJSON(mapValue);
      return;
    }

    setGuardianShareJSON(localStorage.getItem(GUARDIAN_SHARE_KEY_LEGACY) || "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Persist into per-guardian slot if we can resolve one; otherwise keep legacy behavior.
    const slot = resolveMyGuardianSlot();
    if (slot?.group_id && Number.isFinite(Number(slot.guardian_id))) {
      const map = loadGuardianShareMap();
      map[shareMapKeyFor(slot.group_id, slot.guardian_id)] = guardianShareJSON || "";
      saveGuardianShareMap(map);
      return;
    }

    try {
      localStorage.setItem(GUARDIAN_SHARE_KEY_LEGACY, guardianShareJSON || "");
    } catch {
      // ignore
    }
  }, [guardianShareJSON]);

  useEffect(() => {
    if (convo?.convo?.length) ingestGuardianSetupsFromConversation(convo);
  }, [convo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(GROUP_PAIR_KEY);
    if (!raw) return;
    try {
      const pair = JSON.parse(raw);
      if (pair?.group_pubkey) {
        setSetupDraft((prev) => ({
          ...prev,
          group_pubkey: prev.group_pubkey || pair.group_pubkey,
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  const asTrimmedString = (v) => (typeof v === "string" ? v.trim() : `${v ?? ""}`.trim());

  const persistGroupPair = (group_pubkey) => {
    if (typeof window === "undefined") return;
    const gpk = asTrimmedString(group_pubkey);
    if (!gpk) return;
    const gid = buildGuardianGroupIdFromPubkey(gpk);
    if (!gid) return;
    localStorage.setItem(GROUP_PAIR_KEY, JSON.stringify({ group_id: gid, group_pubkey: gpk }));
  };

  const resolveGuardianIdForCurrentConvo = (group_id) => {
    if (typeof window === "undefined") return 1;
    const gid = asTrimmedString(group_id);
    const guardianPub = asTrimmedString(convo?.pubkey);
    if (!gid || !guardianPub) return 1;
    const raw = localStorage.getItem(GROUP_GUARDIAN_MAP_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const current = Array.isArray(map[gid]) ? map[gid] : [];
    let idx = current.indexOf(guardianPub);
    if (idx === -1) {
      current.push(guardianPub);
      map[gid] = current;
      localStorage.setItem(GROUP_GUARDIAN_MAP_KEY, JSON.stringify(map));
      idx = current.length - 1;
    }
    return idx + 1;
  };

  const handleGenerateGroup = () => {
    try {
      const sk = getRandomPrivateKeyBytes();
      const group_pubkey = deriveCompressedPubkeyHex(sk);
      setSetupDraftError("");
      setSetupDraft((prev) => ({ ...prev, group_pubkey }));
      persistGroupPair(group_pubkey);
    } catch (e) {
      alert(`Generate group failed: ${e.message}`);
    }
  };

  const buildGuardianSetupPayload = () => {
    if (!userKeys?.pub) throw new Error("Login required");
    if (!convo?.pubkey) throw new Error("Open a guardian DM first");

    const owner_old_npub = asTrimmedString(nip19.npubEncode(userKeys.pub));
    const guardian_npub = asTrimmedString(nip19.npubEncode(convo.pubkey));
    const group_pubkey = asTrimmedString(setupDraft.group_pubkey);
    const threshold = Number(setupDraft.threshold || 2);
    const guardian_count = Number(setupDraft.guardian_count || 3);

    if (!owner_old_npub.startsWith("npub1")) throw new Error("owner_old_npub is invalid");
    if (!guardian_npub.startsWith("npub1")) throw new Error("guardian_npub is invalid");
    if (!group_pubkey) throw new Error("group_pubkey required (click Generate group)");

    const group_id = buildGuardianGroupIdFromPubkey(group_pubkey);
    if (!group_id) throw new Error("failed to derive group_id");

    const guardian_id = resolveGuardianIdForCurrentConvo(group_id);

    return {
      type: "guardian-setup",
      version: 1,
      record_id: buildGuardianSetupRecordId({ group_id, guardian_id, owner_old_npub }),
      group_id,
      guardian_id,
      threshold,
      guardian_count,
      owner_old_npub,
      guardian_npub,
      group_pubkey,
      participant_ids: [1, 2, 3],
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      status: "active",
    };
  };

  const applyGuardianSetupToComposer = () => {
    try {
      const payload = buildGuardianSetupPayload();
      persistGroupPair(payload.group_pubkey);
      setMessage(JSON.stringify(payload, null, 2));
      setShowSetupBuilder(false);
    } catch (e) {
      alert(`Guardian setup template failed: ${e.message}`);
    }
  };

  const sendGuardianSetupNow = async () => {
    try {
      const payload = buildGuardianSetupPayload();
      persistGroupPair(payload.group_pubkey);
      const payloadText = JSON.stringify(payload);
      devJsonAssert(payloadText, "guardian-setup-send");
      setShowProgress(true);
      await sendMessage(convo.pubkey, payloadText);
      setShowProgress(false);
      setShowSetupBuilder(false);
    } catch (e) {
      setShowProgress(false);
      alert(`Send guardian setup failed: ${e.message}`);
    }
  };

  const handleConfirmRotationRequest = async (rotationReq, msgId) => {
    try {
      setShowProgress(true);
      if (Number(rotationReq?.version) === 2) {
        let candidates = findGuardianSetupsForRequestV2(rotationReq);
        if (candidates.length === 0) {
          const fallback = getActiveGuardianSetups().filter(
            (r) => Number(r.guardian_id) === Number(rotationReq.guardian_id),
          );
          if (fallback.length === 0)
            throw new Error("No guardian setup found for this request");
          candidates = fallback;
          console.warn("[guardian-recovery] using fallback setup candidates", {
            guardian_id: rotationReq.guardian_id,
            req_id: rotationReq.req_id,
            count: fallback.length,
          });
        }
        const messageSecret = (rotationReq?.shared_secret || "").trim();
        const typedSecret = (secretInputs[msgId] || "").trim();
        const sharedSecret = messageSecret || typedSecret;
        if (!sharedSecret) throw new Error("Enter shared secret");
        const validCandidates = candidates.filter((c) => {
          // IMPORTANT: do not fall back to candidate group_id here.
          // For rotation-request v2, the requester may omit group_id (null/""),
          // in which case deriveGuardianSecretProof() must use old_npub as the scope.
          const proof = deriveGuardianSecretProof({
            sharedSecret,
            req_id: rotationReq.req_id,
            nonce: rotationReq.nonce,
            group_id: rotationReq.group_id,
            old_npub: rotationReq.old_npub || rotationReq.old_npub_hint || c.owner_old_npub,
            guardian_id: rotationReq.guardian_id,
          });
          return proof === rotationReq.secret_proof;
        });
        if (validCandidates.length === 0)
          throw new Error("Shared secret does not match");
        const chosen =
          validCandidates.find(
            (_, idx) => `${idx}` === `${setupChoiceByMsg[msgId] || 0}`,
          ) || validCandidates[0];

        // Select the correct share *for this guardian*.
        // Prefer a per-(group_id, guardian_id) stored share; fall back to legacy single-slot.
        const shareRaw =
          (chosen?.group_id && chosen?.guardian_id
            ? getGuardianShareFor({ group_id: chosen.group_id, guardian_id: chosen.guardian_id })
            : "") || guardianShareJSON;

        if (!shareRaw) {
          throw new Error(
            "Missing guardian share for this guardian. If you're running multiple guardians in one browser profile, you must store a distinct share per guardian.",
          );
        }
        const share = JSON.parse(shareRaw);

        // Safety: ensure the guardian share matches the chosen setup.
        if (Number.isFinite(Number(share?.id)) && Number(chosen?.guardian_id) !== Number(share?.id)) {
          throw new Error(
            `Guardian share mismatch: setup guardian_id=${Number(chosen?.guardian_id)} but share.id=${Number(share?.id)}. ` +
              `Each guardian must use their own distinct share JSON.`,
          );
        }
        if (
          share?.groupPubkey &&
          chosen?.group_pubkey &&
          `${share.groupPubkey}`.trim().toLowerCase() !== `${chosen.group_pubkey}`.trim().toLowerCase()
        ) {
          throw new Error(
            "Guardian share mismatch: groupPubkey differs from chosen setup group_pubkey. Ensure the share JSON belongs to this group.",
          );
        }

        const payload = buildRotationAttestationV2({
          req: rotationReq,
          setup: chosen,
          share,
        });
        const payloadText = JSON.stringify(payload);
        devJsonAssert(payloadText, "rotation-attestation-send");
        await sendMessage(convo.pubkey, payloadText);
        setShowProgress(false);
        return;
      }

      if (!guardianShareJSON) throw new Error("Missing guardian share JSON");
      const share = JSON.parse(guardianShareJSON);
      const partial = buildRotationPartial(rotationReq, share);
      const payload = {
        type: "rotation-partial",
        old_npub: rotationReq.old_npub,
        new_npub: rotationReq.new_npub,
        nonce: rotationReq.nonce,
        partial,
      };
      const payloadText = JSON.stringify(payload);
      devJsonAssert(payloadText, "rotation-partial-send");
      await sendMessage(convo.pubkey, payloadText);
      setShowProgress(false);
    } catch (e) {
      setShowProgress(false);
      alert(`Rotation confirm failed: ${e.message}`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (!e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  const handleDelete = async () => {
    let ids =
      multiDeletion.length > 0
        ? multiDeletion
        : [showDelete.giftWrapId || showDelete.id];
    await deleteMessage({
      ids,
      pubkey: convo.pubkey,
    });
    setShowDelete(false);
    setMultiDeletion([]);
  };

  const handleSelectMessageToDelete = (convo, isSelected) => {
    let id = convo.giftWrapId || convo.id;
    if (isSelected) {
      setMultiDeletion((prev) => prev.filter((id) => id !== id));
    } else {
      setMultiDeletion((prev) => [...prev, id]);
    }
    setReplyOn(false);
  };

  if (!convo) return;
  return (
    <>
      {showDelete && (
        <DeleteWarning
          exit={() => setShowDelete(false)}
          handleDelete={handleDelete}
          title={t("ARlLMMl")}
          description={t("ABlFqJP")}
        />
      )}
      <div
        className="fit-container fx-scattered fx-col"
        style={{ height: "100%", rowGap: 0 }}
      >
        {!noHeader && (
          <div
            className="fit-container fx-scattered box-pad-h-m box-pad-v-m"
            style={{ position: "sticky", top: 0 }}
          >
            <div className="fx-centered">
              <div className="round-icon desk-hide" onClick={back}>
                <div className="arrow arrow-back"></div>
              </div>
              <UserProfilePic
                img={convo.picture}
                size={40}
                user_id={convo.pubkey}
                mainAccountUser={false}
              />
              <div>
                <p>
                  {convo.display_name?.substring(0, 10) ||
                    convo.name?.substring(0, 10) ||
                    convo.pubkey.substring(0, 10)}
                </p>
                <p className="p-medium gray-c">
                  @
                  {convo.name?.substring(0, 10) ||
                    convo.display_name?.substring(0, 10)}
                </p>
              </div>
            </div>
            {(userKeys.sec || window?.nostr?.nip44) && (
              <div
                className="fx-centered round-icon-tooltip"
                data-tooltip={legacy ? t("Al6NH4U") : t("AfN9sMV")}
              >
                <p className="p-medium slide-left">{t("ATta6yb")}</p>
                <div
                  className={`toggle ${legacy ? "toggle-dim-gray" : ""} ${
                    !legacy ? "toggle-green" : "toggle-dim-gray"
                  }`}
                  onClick={handleLegacyDMs}
                ></div>
              </div>
            )}
          </div>
        )}
        <div
          className="fx-centered fx-start-h fx-col box-pad-h-m box-pad-v-m fit-container"
          style={{
            height: noHeader ? "100%" : "calc(100% - 160px)",
            overflow: "auto",
            paddingTop: 0,
          }}
          ref={convoContainerRef}
        >
          {legacy && (
            <div
              className="fit-container"
              style={{ position: "sticky", zIndex: 100, top: 0 }}
            >
              <div className="fit-container">
                <div className="box-pad-h-m box-pad-v-m fx-centered fx-start-h fit-container sc-s-18">
                  <div className="info-tt-24"></div>
                  <div>
                    <p className="c1-c p-medium">{t("AakbxOk")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {convo.convo.map((convo, index) => {
            let reply = convo.replyID ? getReply(convo.replyID) : false;
            const rawCandidate =
              (typeof convo.raw_content === "string" && convo.raw_content) ||
              (typeof convo.content === "string" && convo.content) ||
              "";
            const rotationReq = parseRotationRequest(rawCandidate);
            const msgId = convo.giftWrapId || convo.id;
            const protocolType = getProtocolTypeFromRaw(rawCandidate);
            if (!jsonWarnedRef.current.has(msgId) && protocolType) {
              devJsonAssert(rawCandidate, `render-${protocolType}`);
              const parsedReq = parseRotationRequestV2(rawCandidate);
              const parsedAtt = parseRotationAttestationV2(rawCandidate);
              if (protocolType === "rotation-request" && !parsedReq)
                console.warn("[dm-json] rotation-request visible but parser rejected", { msgId });
              if (protocolType === "rotation-attestation" && !parsedAtt)
                console.warn("[dm-json] rotation-attestation visible but parser rejected", { msgId });
              jsonWarnedRef.current.add(msgId);
            }
            const setupCandidatesForUi =
              Number(rotationReq?.version) === 2
                ? (() => {
                    const strict = findGuardianSetupsForRequestV2(rotationReq);
                    if (strict.length > 0) return strict;
                    return getActiveGuardianSetups().filter(
                      (r) => Number(r.guardian_id) === Number(rotationReq.guardian_id),
                    );
                  })()
                : [];
            const sourceText =
              protocolType && typeof rawCandidate === "string"
                ? rawCandidate
                : typeof convo.content === "string"
                  ? convo.content
                  : "";
            const isLongText = typeof sourceText === "string" && sourceText.length > 380;
            const isExpanded = !!expandedMessages[msgId];
            const renderedContent =
              typeof sourceText === "string" && isLongText && !isExpanded
                ? `${sourceText.slice(0, 380)}…`
                : sourceText || convo.content;
            let isSelected = multiDeletion.includes(msgId);
            let zIndex = convo.peer ? conversationLength - index : 0;
            return (
              <div
                key={convo.id}
                className="fit-container fx-centered fx-col"
                style={
                  reply
                    ? {
                        borderRight: convo.peer
                          ? "2px solid var(--orange-main)"
                          : "",
                        borderLeft: !convo.peer
                          ? "2px solid var(--orange-main)"
                          : "",
                        paddingRight: convo.peer ? "1rem" : "",
                        paddingLeft: !convo.peer ? "1rem" : "",
                        position: "relative",
                        zIndex,
                      }
                    : { position: "relative", zIndex }
                }
              >
                {reply && (
                  <div
                    className={`convo-message fit-container  fx-centered fx-col ${
                      !convo.peer ? "fx-start-v" : "fx-end-v"
                    }`}
                  >
                    {convo.peer && reply.self && (
                      <p className="p-italic p-medium orange-c">
                        {t("ARPGCjx")}
                      </p>
                    )}
                    {convo.peer && !reply.self && (
                      <p className="p-italic p-medium orange-c">
                        {t("AUvbLfk")} {peerName}
                      </p>
                    )}
                    {!convo.peer && reply.self && (
                      <p className="p-italic p-medium orange-c">
                        {peerName} {t("AyI4PnF")}
                      </p>
                    )}
                    {!convo.peer && !reply.self && (
                      <p className="p-italic p-medium orange-c">
                        {peerName} {t("AxbN1sx")} {peerName}
                      </p>
                    )}
                    <div
                      className="sc-s-18 box-pad-h-m box-pad-v-m fx-centered fx-start-h fx-start-v fx-col"
                      style={{
                        overflow: "visible",
                        maxWidth: "min(90%, 500px)",
                      }}
                    >
                      <div>{reply.content}</div>
                    </div>
                  </div>
                )}
                <div
                  className={`convo-message fit-container  fx-centered ${
                    !convo.peer ? "fx-start-h" : "fx-end-h"
                  }`}
                >
                  {convo.peer && (
                    <div className="fx-centered">
                      <div className="convo-options slide-left">
                        {((convo.kind === 4 && convo.id) ||
                          (convo.kind === 14 && convo.giftWrapId)) && (
                          <OptionsDropdown
                            displayLeft={false}
                            parent={convoContainerRef}
                            options={[
                              <div
                                className="pointer fit-container fx-centered fx-start-h box-pad-h-s box-pad-v-s option-no-scale"
                                onClick={() =>
                                  copyText(convo.raw_content, t("Ae9XEnt"))
                                }
                              >
                                <div className="copy"></div>
                                <p>{t("AUkCrth")}</p>
                              </div>,
                              <div
                                className="pointer fit-container fx-centered fx-start-h box-pad-h-s box-pad-v-s option-no-scale"
                                onClick={() =>
                                  handleSelectMessageToDelete(convo, isSelected)
                                }
                              >
                                <div
                                  className="arrow"
                                  style={{ rotate: "-90deg" }}
                                ></div>
                                <p>{t("AbqDpIH")}</p>
                              </div>,
                              <div
                                className="pointer fit-container fx-centered fx-start-h box-pad-h-s box-pad-v-s option-no-scale"
                                onClick={() => setShowDelete(convo)}
                              >
                                <div className="trash"></div>
                                <p className=" red-c">
                                  {convo.kind === 4
                                    ? t("AUyfblR")
                                    : t("AvhC4K1")}
                                </p>
                              </div>,
                            ]}
                          />
                        )}
                      </div>
                      <div
                        className="convo-options round-icon slide-left"
                        style={{
                          border: "none",
                          minHeight: "32px",
                          minWidth: "32px",
                          backgroundColor: "var(--dim-gray)",
                          transform: "scaleX(-1)",
                        }}
                        onClick={() => setReplyOn(convo)}
                      >
                        <p className="gray-c">&#x27A6;</p>
                      </div>
                    </div>
                  )}
                  <div className="fx-centered">
                    <div
                      className="sc-s-18 box-pad-h-s box-pad-v-s fx-centered fx-start-h fx-start-v fx-col"
                      style={{
                        backgroundColor: convo.peer
                          ? "var(--orange-side)"
                          : "var(--c1-side)",
                        borderBottomLeftRadius: !convo.peer ? 0 : "inital",
                        borderBottomRightRadius: convo.peer ? 0 : "inital",
                        maxWidth: "min(90%, 500px)",
                        minWidth: "300px",
                        border: "none",
                        overflow: "visible",
                      }}
                    >
                      {protocolType ? (
                        <pre
                          className="fit-container"
                          style={{
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: "12px",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                            margin: 0,
                          }}
                        >
                          {renderedContent}
                        </pre>
                      ) : (
                        <div
                          className="fit-container"
                          style={{
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {renderedContent}
                        </div>
                      ) || <LoadingDots />}
                      {isLongText && (
                        <button
                          className="btn btn-small btn-normal"
                          style={{ alignSelf: "flex-start", marginTop: ".35rem" }}
                          onClick={() =>
                            setExpandedMessages((prev) => ({
                              ...prev,
                              [msgId]: !prev[msgId],
                            }))
                          }
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                      {rotationReq && convo.pubkey !== userKeys.pub && (
                        <div
                          className="fit-container fx-scattered box-pad-v-s"
                          style={{
                            borderTop: "1px solid var(--dim-gray)",
                            marginTop: ".5rem",
                            rowGap: ".5rem",
                            flexDirection: "column",
                            alignItems: "stretch",
                          }}
                        >
                          <p className="p-medium gray-c">
                            rotation-request{rotationReq?.version ? ` v${rotationReq.version}` : ""}
                          </p>
                          {Number(rotationReq?.version) === 2 && (
                            <>
                              {rotationReq?.shared_secret ? (
                                <div className="fit-container" style={{ display: "grid", gap: ".35rem" }}>
                                  <p className="p-small gray-c" style={{ margin: 0 }}>
                                    Shared secret (from requester)
                                  </p>
                                  <pre
                                    className="fit-container"
                                    style={{
                                      margin: 0,
                                      padding: ".5rem",
                                      border: "1px solid var(--dim-gray)",
                                      borderRadius: "8px",
                                      overflowWrap: "anywhere",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {String(rotationReq.shared_secret)}
                                  </pre>
                                </div>
                              ) : (
                                <input
                                  className="if ifs-full"
                                  placeholder="Shared secret"
                                  value={secretInputs[msgId] || ""}
                                  onChange={(e) =>
                                    setSecretInputs((prev) => ({
                                      ...prev,
                                      [msgId]: e.target.value,
                                    }))
                                  }
                                />
                              )}
                              {setupCandidatesForUi.length > 1 && (
                                <select
                                  className="if ifs-full"
                                  value={`${setupChoiceByMsg[msgId] || 0}`}
                                  onChange={(e) =>
                                    setSetupChoiceByMsg((prev) => ({
                                      ...prev,
                                      [msgId]: e.target.value,
                                    }))
                                  }
                                >
                                  {setupCandidatesForUi.map((r, idx) => (
                                    <option value={`${idx}`} key={r.record_id || idx}>
                                      {r.group_id || "(no group id)"} • {r.owner_old_npub?.slice(0, 16)}... • guardian #{r.guardian_id}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </>
                          )}
                          <button
                            className="btn btn-normal"
                            onClick={() => handleConfirmRotationRequest(rotationReq, msgId)}
                          >
                            Confirm
                          </button>
                        </div>
                      )}
                      <div
                        className="fx-centered fx-start-h round-icon-tooltip pointer fit-container"
                        data-tooltip={
                          convo.kind === 4 ? t("ALZCVV2") : t("ATta6yb")
                        }
                      >
                        {convo.kind === 4 && (
                          <>
                            <div>
                              <div className="unprotected"></div>
                            </div>
                            <p
                              className="gray-c p-medium"
                              style={{ fontStyle: "italic" }}
                            >
                              <Date_
                                toConvert={new Date(convo.created_at * 1000)}
                                time={true}
                              />
                            </p>
                          </>
                        )}
                        {convo.kind !== 4 && (
                          <>
                            <div>
                              <div className="protected"></div>
                            </div>
                            <p
                              className="green-c p-medium"
                              style={{ fontStyle: "italic" }}
                            >
                              <Date_
                                toConvert={new Date(convo.created_at * 1000)}
                                time={true}
                              />
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    {convo.peer && multiDeletion.length > 0 && (
                      <div
                        className="fx-centered pointer"
                        onClick={() =>
                          handleSelectMessageToDelete(convo, isSelected)
                        }
                      >
                        <div
                          style={{ minWidth: "24px", minHeight: "24px" }}
                          className="sc-s"
                        >
                          {isSelected && <div className="checkmark-24"></div>}
                        </div>
                      </div>
                    )}
                  </div>
                  {!convo.peer && (
                    <div>
                      <div
                        className="convo-options round-icon slide-right"
                        style={{
                          border: "none",
                          minHeight: "32px",
                          minWidth: "32px",
                          backgroundColor: "var(--dim-gray)",
                          transform: "scaleX(-1)",
                        }}
                        onClick={() => setReplyOn(convo)}
                      >
                        <p className="gray-c">&#x27A6;</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showProgress && <SendingInProgress />}
        {replyOn && (
          <div
            className="fit-container box-pad-h-m box-pad-v-m fx-scattered slide-up"
            style={{
              paddingBottom: 0,
              borderTop: "1px solid var(--very-dim-gray)",
            }}
          >
            <div>
              <p className="gray-c p-medium">
                {t("AoUrRsg")}{" "}
                {replyOn.pubkey === userKeys.pub ? (
                  t("Aesj4ga")
                ) : (
                  <>
                    {convo.display_name?.substring(0, 10) ||
                      convo.name?.substring(0, 10) ||
                      convo.pubkey.substring(0, 10)}
                  </>
                )}
              </p>
              <p className=" p-one-line" style={{ width: "min(90%, 500px)" }}>
                {replyOn.raw_content}
              </p>
            </div>
            <div
              className="close"
              style={{ position: "static" }}
              onClick={() => setReplyOn(false)}
            >
              <div></div>
            </div>
          </div>
        )}
        {multiDeletion.length === 0 && (
          <div className="fit-container box-pad-h-m box-pad-v-m fx-scattered" style={{ flexDirection: "column", alignItems: "stretch", rowGap: ".5rem" }}>
            <div className="fx-centered fx-start-h" style={{ columnGap: ".5rem" }}>
              <button className="btn btn-small" type="button" onClick={() => setShowSetupBuilder((s) => !s)}>
                {showSetupBuilder ? "Hide guardian setup" : "Send guardian setup"}
              </button>
            </div>
            {showSetupBuilder && (
              <div className="sc-s-18 box-pad-h-s box-pad-v-s" style={{ border: "1px solid var(--dim-gray)" }}>
                <p className="p-medium gray-c" style={{ margin: 0 }}>
                  Configure the guardian threshold (m-of-n):
                </p>

                <div className="fx-centered fx-start-h" style={{ marginTop: ".5rem", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className="btn btn-small"
                    type="button"
                    onClick={() => {
                      setSetupDraftError("");
                      setSetupDraft((p) => {
                        const n = Math.max(1, Number(p.guardian_count || 3) - 1);
                        const m = Math.min(Math.max(1, Number(p.threshold || 2)), n);
                        return { ...p, guardian_count: n, threshold: m };
                      });
                    }}
                  >
                    -
                  </button>
                  <input
                    className="if"
                    style={{ width: "4.5rem", textAlign: "center" }}
                    inputMode="numeric"
                    value={setupDraft.threshold}
                    onChange={(e) => {
                      setSetupDraftError("");
                      const raw = Number(e.target.value);
                      setSetupDraft((p) => {
                        const n = Math.max(1, Number(p.guardian_count || 3));
                        const m = Math.min(Math.max(1, Number.isFinite(raw) ? raw : 1), n);
                        return { ...p, threshold: m, guardian_count: n };
                      });
                    }}
                  />
                  <span className="gray-c">of</span>
                  <input
                    className="if"
                    style={{ width: "4.5rem", textAlign: "center" }}
                    inputMode="numeric"
                    value={setupDraft.guardian_count}
                    onChange={(e) => {
                      setSetupDraftError("");
                      const raw = Number(e.target.value);
                      setSetupDraft((p) => {
                        const n = Math.max(1, Number.isFinite(raw) ? raw : 1);
                        const m = Math.min(Math.max(1, Number(p.threshold || 1)), n);
                        return { ...p, guardian_count: n, threshold: m };
                      });
                    }}
                  />
                  <button
                    className="btn btn-small"
                    type="button"
                    onClick={() => {
                      setSetupDraftError("");
                      setSetupDraft((p) => {
                        const n = Math.max(1, Number(p.guardian_count || 3) + 1);
                        const m = Math.min(Math.max(1, Number(p.threshold || 2)), n);
                        return { ...p, guardian_count: n, threshold: m };
                      });
                    }}
                  >
                    +
                  </button>
                </div>

                <div className="fx-centered fx-start-h" style={{ marginTop: ".75rem", gap: ".5rem", flexWrap: "wrap" }}>
                  <button className="btn btn-small" type="button" onClick={handleGenerateGroup}>Generate group</button>
                  <button className="btn btn-small" type="button" onClick={() => copyText(buildGuardianGroupIdFromPubkey(setupDraft.group_pubkey) || "", "Copied")}>Copy group_id</button>
                  <button className="btn btn-small" type="button" onClick={() => copyText(setupDraft.group_pubkey || "", "Copied")}>Copy group_pubkey</button>
                </div>

                <input
                  className="if ifs-full"
                  style={{ marginTop: ".5rem" }}
                  placeholder="group_pubkey (required)"
                  value={setupDraft.group_pubkey}
                  onChange={(e) => {
                    setSetupDraftError("");
                    setSetupDraft((p) => ({ ...p, group_pubkey: e.target.value }));
                  }}
                />

                <p className="p-medium gray-c" style={{ marginTop: ".25rem" }}>
                  group_id is derived from group_pubkey automatically (you only need to share the same group_pubkey across all guardians).
                </p>
                <p className="p-medium gray-c" style={{ marginTop: ".25rem" }}>
                  guardian_id is assigned automatically per group based on guardian DM order (1,2,3,...).
                </p>
                {setupDraftError ? (
                  <p className="p-medium" style={{ marginTop: ".25rem", color: "var(--red)" }}>
                    {setupDraftError}
                  </p>
                ) : null}
                <div className="fx-centered fx-start-h" style={{ marginTop: ".5rem", gap: ".5rem" }}>
                  <button className="btn btn-small" type="button" onClick={applyGuardianSetupToComposer}>Fill compose</button>
                  <button className="btn btn-small btn-normal" type="button" onClick={sendGuardianSetupNow}>Send now</button>
                </div>
              </div>
            )}
            <form
              className="fit-container fx-scattered fx-end-v"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <div
                className="sc-s-18 fx-centered fx-end-v fit-container"
                style={{
                  overflow: "visible",
                  backgroundColor: "transparent",
                  gap: 0,
                }}
              >
                <textarea
                  // type="text"
                  className="if ifs-full if-no-border"
                  placeholder={t("A7a54es")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  ref={inputFieldRef}
                  disabled={showProgress}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  cols={5}
                  style={{
                    padding: ".75rem 0rem .75rem .75rem",
                    maxHeight: "200px",
                    borderRadius: 0,
                  }}
                />
                <div className="fx-centered" style={{ padding: ".75rem" }}>
                  <Emojis
                    position="right"
                    setEmoji={(data) =>
                      setMessage(message ? `${message} ${data} ` : `${data} `)
                    }
                  />
                  <div style={{ position: "relative" }}>
                    <div
                      className="p-small box-pad-v-s box-pad-h-s pointer fx-centered"
                      style={{
                        padding: ".125rem .25rem",
                        border: "1px solid var(--gray)",
                        borderRadius: "6px",
                        backgroundColor: showGifs
                          ? "var(--black)"
                          : "transparent",
                        color: showGifs ? "var(--white)" : "",
                      }}
                      onClick={() => {
                        setShowGifs(!showGifs);
                      }}
                    >
                      GIFs
                    </div>
                    {showGifs && (
                      <Gifs
                        setGif={(data) => {
                          setMessage(message ? `${message} ${data}` : data);
                          setShowGifs(false);
                        }}
                        exit={() => setShowGifs(false)}
                        position="right"
                      />
                    )}
                  </div>
                  <UploadFile
                    round={false}
                    setImageURL={(data) => setMessage(`${message} ${data}`)}
                    setIsUploadsLoading={() => null}
                  />
                </div>
              </div>
              <div className="round-icon" onClick={handleSendMessage}>
                <div className="send-24"></div>
              </div>
            </form>
          </div>
        )}
        {multiDeletion.length > 0 && (
          <div className="fit-container box-pad-h-m box-pad-v-m fx-centered">
            <button
              className="btn btn-gst-red fx"
              onClick={() => setMultiDeletion([])}
            >
              {t("AB4BSCe")}
            </button>
            <button
              className="btn btn-red fx"
              onClick={() => setShowDelete(true)}
            >
              {t("ARlLMMl")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const SendingInProgress = () => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let tempW = 0;
    let interval = setInterval(() => {
      setWidth(tempW);
      if (tempW <= 90) tempW = tempW + 2;
    }, 5);
    return () => {
      clearInterval(interval);
    };
  }, []);
  return (
    <div className="fit-container">
      <div
        style={{
          width: `${width}%`,
          height: "4px",
          backgroundColor: "var(--green-main)",
          transition: ".2s ease-in-out",
        }}
      ></div>
    </div>
  );
};
