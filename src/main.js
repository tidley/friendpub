import { getPublicKey, nip19 } from 'nostr-tools';
import { aggregate, dealerCreate2of3, partialSign, verifyAggregate } from './frost';
import { fetchNip17Inbox, fetchProofs, genKeyPair, publishRotationProof, sendNip17DM, toHex } from './nostr';

const $ = (id) => document.getElementById(id);
const hexToBytes = (h) => Uint8Array.from(h.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
const genPub = (skHex) => getPublicKey(hexToBytes(skHex));

const state = { req: { partials: [], request: null, policy: null, proof: null }, guardianReqs: [] };
const setStatus = (x) => ($('status').textContent = x);
const relays = () => $('relays').value.split(',').map((x) => x.trim()).filter(Boolean);

document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ['requester', 'guardian', 'observer', 'demo'].forEach((t) => $(t).classList.toggle('hidden', t !== b.dataset.tab))));

$('genRequester').onclick = () => {
  const k = genKeyPair();
  $('newNsec').value = k.nsec;
  $('newNpubOut').textContent = `new npub: ${k.npub}`;
};

$('sendReq').onclick = async () => {
  try {
    const skHex = toHex($('newNsec').value.trim());
    const req = {
      type: 'rotation-request',
      old_npub: $('oldNpub').value.trim(),
      new_npub: nip19.npubEncode(genPub(skHex)),
      nonce: crypto.randomUUID(),
      reason: $('reason').value.trim(),
      participant_ids: [1, 2, 3],
    };
    const guardians = $('guardians').value.trim().split('\n').filter(Boolean).map(parseGuardianLine);
    state.req.request = req;
    state.req.policy = { threshold: 2, guardians: guardians.map((g) => ({ id: g.id, npub: g.npub })), groupPubkey: guardians[0]?.groupPubkey };
    $('policy').value = JSON.stringify(state.req.policy, null, 2);
    for (const g of guardians) await sendNip17DM(relays(), skHex, nip19.decode(g.npub).data, req);
    setStatus('rotation request sent');
  } catch (e) { setStatus(`send failed: ${e.message}`); }
};

$('refreshReq').onclick = async () => {
  const skHex = toHex($('newNsec').value.trim());
  const inbox = await fetchNip17Inbox(relays(), skHex, genPub(skHex), Math.floor(Date.now() / 1000) - 86400);
  const req = state.req.request;

  if (!req) {
    setStatus('no active request: send rotation request first');
    state.req.partials = [];
    $('partials').textContent = '[]';
    return;
  }

  const matching = inbox.filter((m) => {
    const j = m.json;
    return j?.type === 'rotation-partial'
      && j.old_npub === req.old_npub
      && j.new_npub === req.new_npub
      && j.nonce === req.nonce
      && Number.isInteger(j.partial?.id);
  });

  // Dedupe by guardian id: keep most recent message per guardian.
  const byGuardian = new Map();
  for (const m of matching) {
    const gid = m.json.partial.id;
    const ts = m.wrap?.created_at || 0;
    const prev = byGuardian.get(gid);
    if (!prev || ts >= prev.ts) byGuardian.set(gid, { ts, partial: m.json.partial });
  }

  state.req.partials = [...byGuardian.values()].map((x) => x.partial).sort((a, b) => a.id - b.id);
  $('partials').textContent = JSON.stringify(state.req.partials, null, 2);
  setStatus(`partials loaded: ${state.req.partials.length} unique guardian(s)`);
};

$('aggregate').onclick = () => {
  const { request, policy, partials } = state.req;
  if (!request || !policy || partials.length < 2) return setStatus('need request + >=2 partials');
  const picked = partials.slice(0, 2);
  const signature = aggregate(request, picked, policy.groupPubkey);
  state.req.proof = {
    type: 'rotation-proof',
    old_npub: request.old_npub,
    new_npub: request.new_npub,
    nonce: request.nonce,
    guardian_set_hash: simpleHash(JSON.stringify(policy)),
    threshold: policy.threshold,
    group_pubkey: policy.groupPubkey,
    participants: picked.map((p) => p.id),
    signature,
  };
  $('proof').textContent = JSON.stringify({ valid_local: verifyAggregate(request, signature, policy.groupPubkey), payload: state.req.proof }, null, 2);
};

$('publishProof').onclick = async () => {
  if (!state.req.proof) return;
  await publishRotationProof(relays(), toHex($('newNsec').value.trim()), state.req.proof);
  setStatus('proof published');
};

$('genGuardian').onclick = () => { $('guardianNsec').value = genKeyPair().nsec; };

$('refreshGuardian').onclick = async () => {
  const skHex = toHex($('guardianNsec').value.trim());
  const filterNpub = $('guardianFilterNpub').value.trim();
  const inbox = await fetchNip17Inbox(relays(), skHex, genPub(skHex), Math.floor(Date.now() / 1000) - 86400);

  let reqs = inbox
    .filter((m) => m.json?.type === 'rotation-request')
    .map((m) => ({
      wrap: m.wrap,
      json: {
        ...m.json,
        old_npub: (m.json?.old_npub || '').trim(),
        new_npub: (m.json?.new_npub || '').trim(),
        nonce: (m.json?.nonce || '').trim(),
      },
    }))
    .filter((m) => !filterNpub || m.json?.new_npub === filterNpub || m.json?.old_npub === filterNpub)
    .sort((a, b) => (b.wrap?.created_at || 0) - (a.wrap?.created_at || 0));

  state.guardianReqs = reqs;
  $('guardianInbox').textContent = JSON.stringify(reqs.map((r) => r.json), null, 2);
  renderGuardianInboxList();
  setStatus(reqs.length ? `guardian inbox: ${reqs.length} message(s)` : 'guardian inbox: no matching request');
};

$('guardianInboxList').onclick = async (ev) => {
  const btn = ev.target.closest('button[data-confirm-index]');
  if (!btn) return;
  const idx = Number(btn.getAttribute('data-confirm-index'));
  const reqWrap = state.guardianReqs[idx];
  const req = reqWrap?.json;
  if (!req) return;
  try {
    const share = JSON.parse($('guardianShare').value || '{}');
    const partial = partialSign(req, share, req.participant_ids || [1, 2], share.groupPubkey);
    await sendNip17DM(relays(), toHex($('guardianNsec').value.trim()), nip19.decode(req.new_npub).data, {
      type: 'rotation-partial', old_npub: req.old_npub, new_npub: req.new_npub, nonce: req.nonce, partial,
    });
    setStatus(`partial sent to ${req.new_npub.slice(0, 16)}…`);
  } catch (e) {
    setStatus(`confirm failed: ${e.message}`);
  }
};

$('fetchProofs').onclick = async () => {
  const pol = JSON.parse($('policy').value || '{}');
  const out = [];
  for (const e of await fetchProofs(relays(), Math.floor(Date.now() / 1000) - 86400 * 7)) {
    try {
      const p = JSON.parse(e.content);
      out.push({ id: e.id, old: p.old_npub, neu: p.new_npub, valid: verifyAggregate({ old_npub: p.old_npub, new_npub: p.new_npub, nonce: p.nonce }, p.signature, pol.groupPubkey || p.group_pubkey) });
    } catch {}
  }
  $('observerOut').textContent = JSON.stringify(out, null, 2);
};

$('demoBtn').onclick = () => {
  const dealer = dealerCreate2of3();
  const oldK = genKeyPair(), newK = genKeyPair(), g = [genKeyPair(), genKeyPair(), genKeyPair()];
  const req = { type: 'rotation-request', old_npub: oldK.npub, new_npub: newK.npub, nonce: crypto.randomUUID(), reason: 'lost key' };
  const shares = dealer.shares.map((s, i) => ({ id: s.id, share: s.share.toString(16).padStart(64, '0'), threshold: 2, groupPubkey: dealer.groupPubkey, guardianNpub: g[i].npub }));
  const p1 = partialSign(req, shares[0], [1, 2], dealer.groupPubkey);
  const p2 = partialSign(req, shares[1], [1, 2], dealer.groupPubkey);
  const sig = aggregate(req, [p1, p2], dealer.groupPubkey);
  const ok = verifyAggregate(req, sig, dealer.groupPubkey);
  const demoData = {
    flow: ['pending', 'partials collected', 'proof published', 'identity rotated'],
    policy: { threshold: 2, groupPubkey: dealer.groupPubkey, guardians: shares.map((x) => ({ id: x.id, npub: x.guardianNpub })) },
    request: req,
    partials: [p1, p2],
    signature: sig,
    verified: ok,
  };
  $('proof').textContent = JSON.stringify(demoData, null, 2);
  renderDemoWalkthrough(demoData);
  ['requester', 'guardian', 'observer', 'demo'].forEach((t) => $(t).classList.toggle('hidden', t !== 'demo'));
  setStatus(ok ? 'demo success' : 'demo failed');
};

function parseGuardianLine(line) {
  const [id, npub, groupPubkey] = line.split(',').map((x) => x.trim());
  return { id: Number(id), npub, groupPubkey };
}

function renderGuardianInboxList() {
  const el = $('guardianInboxList');
  if (!state.guardianReqs.length) {
    el.innerHTML = '<div class="muted">No rotation requests</div>';
    return;
  }

  el.innerHTML = state.guardianReqs.map((r, i) => {
    const sender = (r.json?.new_npub || '').slice(0, 20);
    const oldp = (r.json?.old_npub || '').slice(0, 20);
    const nonce = r.json?.nonce || '';
    return `
      <div class="msg-item">
        <div class="msg-head">
          <div>
            <div><strong>From:</strong> ${sender}…</div>
            <div class="msg-meta">old: ${oldp}… | nonce: ${nonce}</div>
          </div>
          <button data-confirm-index="${i}">Confirm</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderDemoWalkthrough(data) {
  const guardians = data.policy.guardians || [];
  $('trustedGuardians').innerHTML = guardians
    .map((g) => `<span class="guardian-pill">Guardian ${g.id} • ${g.npub.slice(0, 12)}…</span>`)
    .join('');
  $('groupPubkey').textContent = `Group pubkey: ${data.policy.groupPubkey}`;

  const stepStates = [true, true, true, data.partials.length >= 2, !!data.signature, !!data.verified];
  const labels = [
    'Create old identity + guardian set',
    'Create new identity',
    'Send rotation request',
    'Guardians confirm and send partials',
    'Aggregate threshold proof',
    'Publish + observer verifies',
  ];
  $('demoSteps').innerHTML = labels
    .map((label, i) => `<li>${label} ${stepStates[i] ? '<span class="ok">✓</span>' : ''}</li>`)
    .join('');

  $('demoState').textContent = JSON.stringify({
    trusted_guardians: guardians,
    threshold: data.policy.threshold,
    participants_used: data.partials.map((p) => p.id),
    verified: data.verified,
    old_npub: data.request.old_npub,
    new_npub: data.request.new_npub,
  }, null, 2);
}

function simpleHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); }
