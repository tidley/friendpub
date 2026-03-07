import { aggregateRotationProof, deriveGuardianSecretProof, parseRotationAttestationV2 } from "./RotationProof";

/**
 * Build a rotation-request v2 batch for multiple guardians.
 *
 * Invariants:
 * - All payloads share the same req_id and nonce
 * - guardian_id is set per payload
 * - secret_proof is derived from (sharedSecret, req_id, nonce, scope, guardian_id)
 */
export const buildRotationRequestV2Batch = ({
  old_npub,
  new_npub,
  reason = "",
  guardians,
  participant_ids = null,
  group_id = "",
  created_at = Math.floor(Date.now() / 1000),
  expires_at = created_at + 3600,
  // inject for determinism in tests
  req_id,
  nonce,
}) => {
  if (!old_npub || !new_npub) throw new Error("old_npub and new_npub required");
  if (!Array.isArray(guardians) || guardians.length < 1) throw new Error("guardians[] required");

  const uuid = () => {
    try {
      // browser / modern node
      return globalThis.crypto?.randomUUID?.();
    } catch {
      // ignore
    }
    // node fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("node:crypto").randomUUID();
  };

  const reqId = (req_id || uuid()).trim();
  const reqNonce = (nonce || uuid()).trim();

  const payloads = guardians.map((g) => {
    if (!g || !Number.isInteger(Number(g.guardian_id))) throw new Error("guardian_id required");
    if (!g.shared_secret) throw new Error(`shared_secret required for guardian_id ${g.guardian_id}`);

    const scopeGroup = group_id || "";
    const scopeOld = old_npub || "";

    return {
      type: "rotation-request",
      version: 2,
      req_id: reqId,
      group_id: group_id || null,
      guardian_id: Number(g.guardian_id),
      participant_ids: Array.isArray(participant_ids) ? participant_ids : null,
      old_npub: old_npub,
      old_npub_hint: old_npub,
      new_npub: new_npub,
      secret_proof: deriveGuardianSecretProof({
        sharedSecret: g.shared_secret,
        req_id: reqId,
        nonce: reqNonce,
        group_id: scopeGroup,
        old_npub: scopeOld,
        guardian_id: Number(g.guardian_id),
      }),
      nonce: reqNonce,
      reason: reason || "",
      created_at,
      expires_at,
    };
  });

  return { req_id: reqId, nonce: reqNonce, payloads };
};

/**
 * Parse + collect rotation-attestation v2 messages, filtering by req_id/nonce/new_npub.
 *
 * @param {Array<{from?: string, raw: any, created_at?: number}>} messages
 */
export const collectRotationAttestationsV2 = (messages, { req_id, nonce, new_npub } = {}) => {
  const reqIdFilter = (req_id || "").trim();
  const nonceFilter = (nonce || "").trim();
  const newFilter = (new_npub || "").trim();

  const rows = [];
  for (const m of messages || []) {
    const parsed = parseRotationAttestationV2(m?.raw);
    if (!parsed) continue;
    if (reqIdFilter && String(parsed.req_id || "").trim() !== reqIdFilter) continue;
    if (nonceFilter && String(parsed.nonce || "").trim() !== nonceFilter) continue;
    if (newFilter && String(parsed.new_npub || "").trim() !== newFilter) continue;

    rows.push({
      from: m?.from ? String(m.from).trim() : "",
      created_at: Number(m?.created_at || 0),
      attestation: parsed,
      partial: parsed.partial,
    });
  }

  // newest first (matches demo behavior)
  rows.sort((a, b) => b.created_at - a.created_at);
  return rows;
};

export const pickUniqueGuardianPartials = (rows, threshold = 2) => {
  const picked = [];
  const seen = new Set();

  for (const r of rows || []) {
    const a = r?.attestation;
    const guardianKey = (r?.from && String(r.from).trim())
      ? `from:${String(r.from).trim()}`
      : `gid:${String(a?.guardian_id ?? "").trim()}`;

    if (!guardianKey || seen.has(guardianKey)) continue;
    seen.add(guardianKey);
    if (r?.partial) picked.push(r.partial);
    if (picked.length >= threshold) break;
  }

  return picked;
};

/**
 * Aggregate rotation proof from a set of attestations.
 *
 * Enforced invariants:
 * - All attestations MUST match req_id AND nonce (if provided in ctx)
 * - At least `threshold` unique guardians
 */
export const aggregateRotationProofFromAttestationsV2 = (
  ctx,
  rows,
  groupPubkey,
  { threshold = 2 } = {},
) => {
  const reqId = (ctx?.req_id || "").trim();
  const nonce = (ctx?.nonce || "").trim();
  if (!ctx?.old_npub || !ctx?.new_npub || !nonce) throw new Error("old_npub/new_npub/nonce required");
  if (!groupPubkey) throw new Error("groupPubkey required");

  for (const r of rows || []) {
    const a = r?.attestation;
    if (!a) continue;
    if (reqId && String(a.req_id || "").trim() !== reqId) throw new Error("mixed req_id in attestations");
    if (nonce && String(a.nonce || "").trim() !== nonce) throw new Error("mixed nonce in attestations");
  }

  const picked = pickUniqueGuardianPartials(rows, threshold);
  if (picked.length < threshold) throw new Error(`need ${threshold} unique guardian partials`);

  return aggregateRotationProof(
    { old_npub: ctx.old_npub, new_npub: ctx.new_npub, nonce },
    picked,
    groupPubkey,
  );
};
