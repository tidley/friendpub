import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { genKeyPair, toHex } from '../src/nostr.js';

describe('nostr helpers', () => {
  it('generates valid keypair encodings', () => {
    const k = genKeyPair();
    expect(k.skHex).toMatch(/^[0-9a-f]{64}$/);
    expect(k.pubHex).toMatch(/^[0-9a-f]{64}$/);
    expect(k.nsec.startsWith('nsec1')).toBe(true);
    expect(k.npub.startsWith('npub1')).toBe(true);
  });

  it('toHex accepts hex and nsec', () => {
    const k = genKeyPair();
    expect(toHex(k.skHex)).toBe(k.skHex);
    expect(toHex(k.nsec)).toBe(k.skHex);
  });

  it('generated npub decodes to generated pubHex', () => {
    const k = genKeyPair();
    const decoded = nip19.decode(k.npub);
    expect(decoded.type).toBe('npub');
    expect(decoded.data).toBe(k.pubHex);
  });
});
