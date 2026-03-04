import { describe, it, expect } from 'vitest';
import { aggregate, dealerCreate2of3, partialSign, rotateMsgHash, verifyAggregate } from '../src/frost.js';

describe('frost threshold Schnorr PoC', () => {
  it('produces deterministic message hash for same input', () => {
    const a = rotateMsgHash('npub_old', 'npub_new', 'nonce-1');
    const b = rotateMsgHash('npub_old', 'npub_new', 'nonce-1');
    const c = rotateMsgHash('npub_old', 'npub_new', 'nonce-2');
    expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'));
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(c).toString('hex'));
  });

  it('verifies aggregated proof with 2-of-3 shares', () => {
    const dealer = dealerCreate2of3();
    const req = { old_npub: 'npub_old', new_npub: 'npub_new', nonce: 'abc123' };
    const shares = dealer.shares.map((s) => ({ id: s.id, share: s.share.toString(16).padStart(64, '0') }));

    const p1 = partialSign(req, shares[0], [1, 2], dealer.groupPubkey);
    const p2 = partialSign(req, shares[1], [1, 2], dealer.groupPubkey);
    const proof = aggregate(req, [p1, p2], dealer.groupPubkey);

    expect(verifyAggregate(req, proof, dealer.groupPubkey)).toBe(true);
  });

  it('fails verification if request is tampered', () => {
    const dealer = dealerCreate2of3();
    const req = { old_npub: 'npub_old', new_npub: 'npub_new', nonce: 'abc123' };
    const shares = dealer.shares.map((s) => ({ id: s.id, share: s.share.toString(16).padStart(64, '0') }));

    const p1 = partialSign(req, shares[0], [1, 2], dealer.groupPubkey);
    const p2 = partialSign(req, shares[1], [1, 2], dealer.groupPubkey);
    const proof = aggregate(req, [p1, p2], dealer.groupPubkey);

    const tamperedReq = { ...req, new_npub: 'npub_new_other' };
    expect(verifyAggregate(tamperedReq, proof, dealer.groupPubkey)).toBe(false);
  });
});
