import {
  parseGuardianSetupUpdateV1,
  parseGuardianSetupV1,
  parseRotationRequestV2,
} from "@/Helpers/RotationProof";

const STORAGE_KEY = "guardian-setup-index-v1";

const nowSec = () => Math.floor(Date.now() / 1000);

const safeJSON = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const loadGuardianSetupIndex = () => {
  if (typeof window === "undefined") return { byRecordId: {}, seen: {}, updated_at: 0 };
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw
    ? safeJSON(raw, { byRecordId: {}, seen: {}, updated_at: 0 })
    : { byRecordId: {}, seen: {}, updated_at: 0 };
};

export const saveGuardianSetupIndex = (index) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(index || { byRecordId: {}, seen: {}, updated_at: nowSec() }));
};

const messageIdFor = (msg) => msg?.giftWrapId || msg?.id || `${msg?.created_at || 0}:${msg?.pubkey || ""}`;

const applySetup = (index, setup, sourceMsg) => {
  const existing = index.byRecordId[setup.record_id];
  const incomingTs = Number(setup.updated_at || setup.created_at || sourceMsg?.created_at || nowSec());
  const existingTs = Number(existing?.updated_at || existing?.created_at || 0);
  if (!existing || incomingTs >= existingTs) {
    index.byRecordId[setup.record_id] = {
      ...existing,
      ...setup,
      source_event_id: messageIdFor(sourceMsg),
      updated_at: incomingTs,
    };
  }
};

const applyUpdate = (index, update, sourceMsg) => {
  const existing = index.byRecordId[update.record_id] || {};
  const incomingTs = Number(update.updated_at || sourceMsg?.created_at || nowSec());
  const existingTs = Number(existing.updated_at || 0);
  if (incomingTs >= existingTs) {
    index.byRecordId[update.record_id] = {
      ...existing,
      record_id: update.record_id,
      group_id: update.group_id,
      guardian_id: update.guardian_id,
      status: update.status || "active",
      updated_at: incomingTs,
      source_event_id: messageIdFor(sourceMsg),
    };
  }
};

export const ingestGuardianSetupsFromChatrooms = (chatrooms = []) => {
  const index = loadGuardianSetupIndex();
  for (const room of chatrooms || []) {
    for (const msg of room?.convo || []) {
      const msgId = messageIdFor(msg);
      if (index.seen[msgId]) continue;
      const raw = msg?.raw_content || msg?.content;
      const setup = parseGuardianSetupV1(raw);
      const update = parseGuardianSetupUpdateV1(raw);
      if (setup) applySetup(index, setup, msg);
      if (update) applyUpdate(index, update, msg);
      index.seen[msgId] = 1;
    }
  }
  index.updated_at = nowSec();
  saveGuardianSetupIndex(index);
  return index;
};

export const ingestGuardianSetupsFromConversation = (conversation) =>
  ingestGuardianSetupsFromChatrooms(conversation ? [conversation] : []);

export const getActiveGuardianSetups = () => {
  const index = loadGuardianSetupIndex();
  return Object.values(index.byRecordId || {}).filter((r) => (r.status || "active") !== "revoked");
};

export const findGuardianSetupsForRequestV2 = (request) => {
  const req = parseRotationRequestV2(request);
  if (!req) return [];
  const rows = getActiveGuardianSetups();
  return rows.filter(
    (r) => r.group_id === req.group_id && Number(r.guardian_id) === Number(req.guardian_id),
  );
};
