import {
  parseGuardianSetupUpdateV1,
  parseGuardianSetupV1,
  parseRotationRequestV2,
} from "@/Helpers/RotationProof";

const STORAGE_KEY = "guardian-setup-index-v1";
const GUARDIAN_SHARE_MAP_KEY = "guardian-share-map-v1";

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

const pruneGuardianSetupIndex = (index, limits = { maxSeen: 5000, maxRecords: 2000 }) => {
  if (!index || typeof index !== "object") return { byRecordId: {}, seen: {}, updated_at: nowSec() };

  const out = {
    byRecordId: index.byRecordId && typeof index.byRecordId === "object" ? index.byRecordId : {},
    seen: index.seen && typeof index.seen === "object" ? index.seen : {},
    updated_at: Number(index.updated_at || nowSec()),
  };

  // Prune `seen` (unbounded growth risk). Keep newest by approximating recency from the msgId prefix
  // which is often `${created_at}:${pubkey}`.
  try {
    const entries = Object.entries(out.seen);
    if (entries.length > limits.maxSeen) {
      entries.sort((a, b) => {
        const ta = Number(String(a[0]).split(":")[0]) || 0;
        const tb = Number(String(b[0]).split(":")[0]) || 0;
        return tb - ta;
      });
      out.seen = Object.fromEntries(entries.slice(0, limits.maxSeen));
    }
  } catch {
    // ignore prune failures
  }

  // Prune `byRecordId` by updated_at
  try {
    const entries = Object.entries(out.byRecordId);
    if (entries.length > limits.maxRecords) {
      entries.sort((a, b) => Number(b[1]?.updated_at || 0) - Number(a[1]?.updated_at || 0));
      out.byRecordId = Object.fromEntries(entries.slice(0, limits.maxRecords));
    }
  } catch {
    // ignore prune failures
  }

  return out;
};

export const saveGuardianSetupIndex = (index) => {
  if (typeof window === "undefined") return;
  const payload = pruneGuardianSetupIndex(index || { byRecordId: {}, seen: {}, updated_at: nowSec() });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    // Lossy, non-crashing behavior on quota issues.
    const name = e?.name || "";
    const msg = e?.message || "";
    const isQuota = name === "QuotaExceededError" || /quota/i.test(msg);
    if (!isQuota) {
      console.warn("[guardian-setup-index] failed to persist index", e);
      return;
    }

    console.warn("[guardian-setup-index] localStorage quota exceeded; pruning/clearing and continuing");

    // Attempt recovery: remove our key and retry with more aggressive pruning.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    try {
      const smaller = pruneGuardianSetupIndex(payload, { maxSeen: 1000, maxRecords: 500 });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(smaller));
    } catch (e2) {
      // Give up silently; app must keep running.
      console.warn("[guardian-setup-index] persist retry failed; running without persistence", e2);
    }
  }
};

const messageIdFor = (msg) => msg?.giftWrapId || msg?.id || `${msg?.created_at || 0}:${msg?.pubkey || ""}`;

const safePersistEmbeddedShare = (raw, setup) => {
  try {
    if (typeof window === "undefined") return;
    if (!setup?.group_id || !setup?.guardian_id || !setup?.group_pubkey) return;

    const j = typeof raw === "string" ? safeJSON(raw, null) : raw;
    const share = (j?.share || "").trim();
    if (!share) return;

    const key = `${setup.group_id}:${Number(setup.guardian_id)}`;
    const mapRaw = localStorage.getItem(GUARDIAN_SHARE_MAP_KEY);
    const map = mapRaw ? safeJSON(mapRaw, {}) : {};

    map[key] = JSON.stringify({
      id: Number(setup.guardian_id),
      share,
      threshold: Number(setup.threshold || 2),
      groupPubkey: setup.group_pubkey,
    });

    localStorage.setItem(GUARDIAN_SHARE_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    // non-fatal; demo UX only
    console.warn("[guardian-share] embedded share persist failed", e?.message || e);
  }
};

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
      const looksLikeSetup =
        typeof raw === "string" &&
        (raw.includes('"type":"guardian-setup"') || raw.includes('"type": "guardian-setup"'));
      const looksLikeUpdate =
        typeof raw === "string" &&
        (raw.includes('"type":"guardian-setup-update"') || raw.includes('"type": "guardian-setup-update"'));
      if (looksLikeSetup && !setup) {
        console.warn("[guardian-setup-index] setup message not indexed", { msgId, room: room?.pubkey });
      }
      if (looksLikeUpdate && !update) {
        console.warn("[guardian-setup-index] setup-update message not indexed", { msgId, room: room?.pubkey });
      }
      if (setup) {
        applySetup(index, setup, msg);
        // Option 1 bundle: if guardian-setup includes an embedded `share`, persist it too.
        safePersistEmbeddedShare(raw, setup);
      }
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
  if (req.group_id) {
    const strict = rows.filter(
      (r) => r.group_id === req.group_id && Number(r.guardian_id) === Number(req.guardian_id),
    );
    if (strict.length > 0) return strict;
  }
  return rows.filter(
    (r) =>
      Number(r.guardian_id) === Number(req.guardian_id) &&
      (!!req.old_npub ? r.owner_old_npub === req.old_npub : true),
  );
};
