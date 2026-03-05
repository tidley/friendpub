# What is YakiHonne?

A decentralized social payment client on `Nostr` & `Bitcoin`. Check it out at [yakihonne.com](https://yakihonne.com)

YakiHonne also runs its own relays under [nostr-01.yakihonne.com](https://nostr-01.yakihonne.com) and [nostr-02.yakihonne.com](https://nostr-02.yakihonne.com) for creators to publish their content, it is free of charge. The relay is based on [strfry](https://github.com/hoytech/strfry) and written in cpp if you would like to check it out.


# Gallery

| <img src="https://github.com/user-attachments/assets/9bf2f6fe-6449-4376-acb0-bb31209d01e6" alt="screen-2" width="320"/> | <img src="https://github.com/user-attachments/assets/e615b20f-2b75-4e51-8d6b-7e5ae1f804e1" alt="screen-3" width="320"/> | <img src="https://github.com/user-attachments/assets/73f5ab22-dc20-4fea-bbad-5bba82a520f7" alt="screen-4" width="320"/> |
|---|---|---|
| <img src="https://github.com/user-attachments/assets/c38f377a-eba7-42e9-9b69-b073cd2caff8" alt="screen-5" width="320"/> | <img src="https://github.com/user-attachments/assets/1d357c0f-7f50-4d47-8ed1-67d4dadb266c" alt="screen-6" width="320"/> | <img src="https://github.com/user-attachments/assets/4c4690f0-7983-405d-8602-f0a78e8fbcae" alt="screen-7" width="320"/> |
| <img src="https://github.com/user-attachments/assets/77ec6919-aa9f-45a8-a47c-392056c316f1" alt="screen-8" width="320"/> | <img src="https://github.com/user-attachments/assets/b242a381-2371-421e-acf7-68f0e12ceae3" alt="screen-9" width="320"/> | <img src="https://github.com/user-attachments/assets/3f4971a8-6f89-49ed-8d37-6baa7bda9e87" alt="screen-10" width="320"/> |
| <img src="https://github.com/user-attachments/assets/78694e2c-26a0-4a34-a49b-7c9e8f4cc955" alt="screen-11" width="320"/> | <img src="https://github.com/user-attachments/assets/8ec258bf-e7d4-4111-8001-90e46e0e68fb" alt="screen-12" width="320"/> | <img src="https://github.com/user-attachments/assets/8567c974-5c20-4198-a0fa-1dab303b2b55" alt="screen-13" width="320"/> |
| <img src="https://github.com/user-attachments/assets/8576feb7-ab77-45e6-b48e-4624ef970ad8" alt="screen-14" width="320"/> |  |  |

# 1. Features

## 1.1 Cient

- [x] Login options support: keys, wallet, on-the-go account creation (NIP-01, NIP-07)
- [x] Bech32 encoding support (NIP-19)
- [x] Global Feed based on user all relays
- [x] Custom Feed based on user following
- [x] Top creators list based on all relays/selected relay
- [x] Top curators list based on nostr-01.yaihonne.com relay
- [x] Latest discussed topics based on hashtags
- [x] Home carousel containing latest published curations
- [x] Curations: topic-related curated articles (NIP-51)
- [x] My curations, My articles sections as a space for creators to manage and organize their content
- [x] Rich markdown editor to write and preview long-form content (NIP-23)
- [x] The ability to draft/edit/delete articles (NIP-09, NIP-23)
- [x] Topic-related search using hashtags (NIP-12)
- [x] Users search using pubkeys
- [x] Built-in upload for user profile images and banners within nostr-01.yakikhonne.com
- [x] User profile page: following/followers/zapping/published articles
- [x] URI scheme support (currenly only naddr) (NIP-21)
- [x] Users follow/unfollow (NIP-02)
- [x] Lightning zaps: via QR codes or dedicted wallet (NIP-57)
- [x] Customizable user settings: Keypair, Lightning Addres, relay list
- [x] Relay list metadata support (NIP-65)
- [x] And many others feel free to visit or download YakiHonne to explore 

## 1.2 Relay

[nostr-01.yakihonne.com](https://nostr-01.yakihonne.com) and [nostr-02.yakihonne.com](https://nostr-02.yakihonne.com) relay is fully based on [strfry](https://github.com/hoytech/strfry) implementation and writted in Typescript.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

---

# Guardian-based npub recovery / key-rotation demo

This fork includes an experimental demo page + DM UX for guardian-based recovery.

## Where the demo lives
- Requester / aggregation UI: `src/pages/key-rotation-demo.js`
- Guardian DM confirm UI: `src/Components/ConversationBox.js`
- Parsing + verification helpers: `src/Helpers/RotationProof.js`
- DM-history setup indexing: `src/Helpers/GuardianSetupIndex.js`

## Manual walkthrough (2-of-3 guardians, unique secret per guardian)

### 0) Run the app
```bash
corepack pnpm install
corepack pnpm dev
```
Then open: <http://localhost:3400/key-rotation-demo>

### 1) Guardian setup (while you still control the *old* npub)
For each guardian, send them a NIP-17 DM containing a JSON payload:
- `type: "guardian-setup"`, `version: 1`
- includes `group_id`, `guardian_id` (1..3), `threshold: 2`, and `group_pubkey`.

Important: guardians must have the setup DM in their DM history. The web client will ingest old setup DMs on startup / when opening the DM.

### 2) Recovery request (from your *new* npub)
Send each guardian a NIP-17 DM containing:
- `type: "rotation-request"`, `version: 2`
- includes `group_id`, `guardian_id`, `new_npub`, `nonce`, `expires_at`, and `secret_proof`.

Each guardian uses their unique shared secret to validate the request and confirm.

### 3) Guardian confirm
On the guardian side, open the DM thread with the requester. The client should:
- detect the v2 rotation request
- auto-match the stored setup record by `group_id + guardian_id`
- prompt for the shared secret
- send back a `rotation-attestation` v2 on confirm

### 4) Aggregate proof (requester)
Back on `/key-rotation-demo`, collect attestations until threshold (2-of-3) is met and aggregate the rotation proof.

## Network DM flow (manual, step-by-step)

This is the **Yakihonne UI-centric** way to run the demo, using real NIP-17 DMs inside the app.

### Actors (recommend 5 browser profiles)
- **Requester (old npub)** — the account that originally set up guardians
- **Guardian #1**
- **Guardian #2**
- **Guardian #3**
- **Requester (new npub)** — the account you’re rotating/recovering to

Tip: use separate browser profiles or incognito windows so session storage doesn’t overlap.

### A) Initial guardian enrollment (old npub → guardians)
1. Log into Yakihonne as **Requester (old npub)**.
2. Open **Messages / DMs** and start (or open) a DM thread with each guardian.
3. For each guardian, send a single JSON message payload (NIP-17 DM) of:
   - `type: "guardian-setup"`, `version: 1`
   - same `group_id` + `group_pubkey` for all three guardians
   - unique `guardian_id` (1, 2, 3)
   - `threshold: 2`, `guardian_count: 3`
4. On each guardian account, open Yakihonne and open the DM thread so the web client can **ingest the setup DM from DM history**.

Expected `guardian-setup` JSON shape (v1):
```json
{
  "type": "guardian-setup",
  "version": 1,
  "record_id": "<sha256(group_id|guardian_id|owner_old_npub)>",
  "group_id": "g_<hash>",
  "guardian_id": 1,
  "threshold": 2,
  "guardian_count": 3,
  "owner_old_npub": "npub1...",
  "guardian_npub": "npub1...",
  "group_pubkey": "<hex>",
  "participant_ids": [1,2,3],
  "status": "active"
}
```

Expected result: the guardian client has enough information stored (via DM history ingestion + cache) to later match recovery requests without the requester having to paste the group pubkey.

### B) Recovery request (new npub → guardians)
1. Log into Yakihonne as **Requester (new npub)**.
2. In `/key-rotation-demo`, you have two paths:
   - **Setup-record mode** (old account / setup available): select an indexed setup record and send v2 requests.
   - **Recovery mode** (new account / no setup record): enable `Recovery mode (no setup record on this account)` and provide full `old_npub` plus guardian rows (`npub + secret`).
3. For each guardian, send a v2 request containing:
   - `type: "rotation-request"`, `version: 2`
   - `guardian_id`, `old_npub`, `new_npub`, `nonce`, `expires_at`, and `secret_proof`
   - `group_id` may be omitted/null in recovery mode.
4. `secret_proof` uses guardian-specific secrets and is validated by guardians against candidate setup records.

Expected `rotation-request` JSON shape (v2):
```json
{
  "type": "rotation-request",
  "version": 2,
  "req_id": "<uuid>",
  "group_id": "g_<hash> or null",
  "guardian_id": 1,
  "old_npub": "npub1...",
  "new_npub": "npub1...",
  "nonce": "<uuid>",
  "expires_at": 1760000000,
  "secret_proof": "<sha256(secret|req_id|nonce|group_id_or_old_npub|guardian_id)>"
}
```

### C) Guardian confirmation (guardians → requester)
1. Each guardian opens the DM thread with the requester.
2. In the conversation, the app should detect a **v2 rotation request** and render a confirm UI.
3. Guardian selects the matched setup record (auto-match if unique; dropdown if multiple).
4. Guardian enters their shared secret and clicks **Confirm**.

Expected result: guardian sends back a `rotation-attestation` v2 DM to the requester.

### D) Threshold + aggregation (requester)
1. On the requester side, open `/key-rotation-demo`.
2. Once **2 of 3** guardian attestations are received, aggregate/verify the rotation proof.

Troubleshooting:
- If a guardian doesn’t see the confirm UI, ensure they received (and can decrypt) the `guardian-setup` DM and have opened the DM thread at least once in the web client.
- If matching fails in setup-record mode, verify `group_id` + `guardian_id` are consistent across setup + request.
- If matching fails in recovery mode, verify `old_npub`, `guardian_id`, and guardian secret are correct.

## Notes
- Rotation proof publish kind was moved to avoid collisions: `ROTATION_PROOF_KIND = 39093`.
- Lint may currently fail due to upstream Next lint config issues; `pnpm build` should still work.

