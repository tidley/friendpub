# NIP-XX: Friendpub — Web-of-Trust Key Rotation (Mutual-Follow Guardians)

> Draft / proposal.
>
> Goal: Standardize a deterministic, verifiable, web-of-trust-backed key rotation mechanism using Nostr graph data (NIP-03 contact lists) and NIP-17 DMs for attestations.

## Motivation
Key rotation is hard because it must balance:

- **Recoverability** (humans lose keys/devices)
- **Security** (attackers try to hijack identities)
- **Verifiability** (third parties need to verify a rotation without privileged access)

Friendpub proposes a **web-of-trust threshold rotation**:

- Guardians are derived deterministically from the social graph.
- Rotation requests are sent to a sampled subset of guardians.
- Guardians attest via encrypted DMs.
- The rotating party publishes an aggregated proof event that verifiers can check.

## Scope
This NIP specifies:

- Deterministic **guardian pool derivation** from NIP-03 contact lists.
- Deterministic **sampling** (adaptive) for large accounts.
- Message and event formats for:
  - rotation requests
  - guardian attestations
  - published rotation proofs

This NIP does **not** specify a proactive share-refresh protocol (that can be a future extension).

## Terminology
- **old key**: the pubkey currently associated with an identity.
- **new key**: the pubkey the user wants to rotate to.
- **guardian**: an account eligible to attest a rotation.
- **guardian pool**: the set of all guardians derived from the social graph.
- **sample**: a deterministic subset of the pool used for a specific rotation request.
- **threshold**: minimum number of attestations required.

## Guardian pool derivation (mutual follows only)
Guardian pool MUST be derived from NIP-03 contact lists (kind `3`).

Let:
- `F_old` be the set of pubkeys followed by `old_pubkey` (from old's contact list).
- `F_back` be the set of pubkeys that follow `old_pubkey` (requires fetching each candidate's contact list).

The guardian pool `G` is the set of **mutual follows**:

```
G = { pk | pk ∈ F_old AND old_pubkey ∈ F_pk }
```

Notes:
- Clients MUST define a consistent method of selecting the relevant kind-3 events (latest by `created_at`, or by relay policy) for determinism.
- Clients SHOULD cache and include relay sources used to compute `G` for auditability.

## Deterministic sampling
Large pools should not require contacting everyone.

Given guardian pool `G`, a request defines:

- `m` = sample size (adaptive)
- `t` = threshold (adaptive or configured)

### Adaptive parameters
This NIP intentionally leaves exact adaptive formulas as guidance; clients may tune them.

A suggested starting point:

- `m = clamp(25, 200, round(10 * sqrt(|G|)))`
- `t = clamp(2, m, round(0.6 * m))`

### Seed
The seed MUST be deterministic and verifiable from the published proof event.

Recommended seed preimage:

```
seed = sha256(
  "friendpub:v1" ||
  old_pubkey ||
  new_pubkey ||
  nonce ||
  req_id
)
```

### Sampling algorithm
Let `G_sorted` be the guardian pool sorted by ascending pubkey.

Define score for each guardian `pk`:

```
score(pk) = sha256(seed || pk)
```

Take the `m` guardians with the lowest score (ties broken by pubkey).

The sampled set `S` is ordered by ascending score.

## Message flow
### 1) Rotation request (DM)
The new key sends NIP-17 DMs to each guardian in `S`.

Payload:

```json
{
  "type": "rotation-request",
  "version": 3,
  "req_id": "uuid",
  "old_pubkey": "hex",
  "old_npub": "npub1…",
  "new_pubkey": "hex",
  "new_npub": "npub1…",
  "nonce": "uuid",
  "group": {
    "derivation": "mutual-follows-nip03:v1",
    "pool_commit": "sha256(...)",
    "sample": {
      "m": 50,
      "t": 30,
      "seed": "hex",
      "guardians": ["npub1…", "npub1…"]
    }
  },
  "reason": "string",
  "created_at": 123,
  "expires_at": 456
}
```

### 2) Guardian attestation (DM)
Guardians reply to the new key with an attestation bound to `req_id`.

Attestation details are implementation-defined for now (e.g., a Schnorr signature over the request hash). For compatibility with existing Friendpub code paths, this can remain similar to `rotation-attestation` v2.

### 3) Rotation proof (public event)
The new key publishes a proof event that a verifier can validate.

Event kind TBD (new kind allocated by this NIP).

Content MUST include:
- old/new npub
- req_id + nonce
- derivation method id + parameters
- sample size `m` + threshold `t`
- sampled guardian list `S` (or a commitment plus a deterministic reconstruction method)
- aggregated signature + participant list

## Verification algorithm (high level)
Given a rotation proof event:

1) Parse proof fields.
2) Recompute seed and sampled set `S`.
3) Verify each attestation (or verify the aggregated signature) against the guardians in `S`.
4) If at least `t` valid attestations are present, accept rotation.

## Security considerations
### Sybil considerations (clarification)
Even with mutual follows, sybil risk is not “gone”; it depends on user behavior.

Attack scenario:
- An attacker creates many accounts and convinces the victim to follow them.
- If any of those accounts also follow the victim, they become **mutual follows**, and can enter `G`.

So the mutual-follow rule reduces sybil risk compared to “followers only”, but does not eliminate it.

Mitigations (optional extensions):
- minimum account age / activity
- WoT scoring / graph distance constraints
- diversity constraints (don’t allow >k guardians from same relay set / domain / metadata cluster)

## Backwards compatibility
This NIP can coexist with existing 2-of-3 guardian-set flows:
- v2/v1 proof formats can remain supported.
- clients can migrate to v3 request/proof incrementally.

## Reference implementation notes
- See `implementation/yakihonne/src/pages/key-rotation-demo.js` for prototype UI.
