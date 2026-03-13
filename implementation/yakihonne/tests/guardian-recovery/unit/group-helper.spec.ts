import { describe, expect, it, vi } from "vitest";
import { deriveCompressedPubkeyHex, getRandomPrivateKeyBytes } from "../../../src/Helpers/GuardianGroup";

const samplePriv = new Uint8Array(32).fill(0x42);
const compressedHex = `02${"a".repeat(64)}`;
const fallbackHex = `03${"b".repeat(64)}`;

describe("GuardianGroup helpers", () => {
  it("prefers secp.utils.randomPrivateKey + getPublicKey", () => {
    const mockSecp = {
      utils: {
        randomPrivateKey: vi.fn(() => samplePriv),
      },
      getPublicKey: vi.fn(() => compressedHex),
      Point: {
        fromPrivateKey: vi.fn(() => ({
          toHex: () => fallbackHex,
        })),
      },
      etc: {
        randomBytes: vi.fn(() => samplePriv),
      },
    };

    const random = getRandomPrivateKeyBytes(mockSecp);
    expect(random).toBe(samplePriv);
    const derived = deriveCompressedPubkeyHex(samplePriv, mockSecp);
    expect(derived).toBe(compressedHex);
    expect(mockSecp.getPublicKey).toHaveBeenCalledWith(samplePriv, true);
  });

  it("falls back to secp.etc.randomBytes when randomPrivateKey missing", () => {
    const fallbackPriv = new Uint8Array(32).fill(0x01);
    const mockSecp = {
      etc: {
        randomBytes: vi.fn(() => fallbackPriv),
      },
    };

    const random = getRandomPrivateKeyBytes(mockSecp);
    expect(random).toBe(fallbackPriv);
    expect(mockSecp.etc.randomBytes).toHaveBeenCalledWith(32);
  });

  it("uses Point.fromPrivateKey when getPublicKey missing", () => {
    const mockSecp = {
      Point: {
        fromPrivateKey: vi.fn(() => ({
          toHex: () => fallbackHex,
        })),
      },
    };

    const derived = deriveCompressedPubkeyHex(samplePriv, mockSecp);
    expect(mockSecp.Point.fromPrivateKey).toHaveBeenCalledWith(samplePriv);
    expect(derived).toBe(fallbackHex);
    expect(derived).toHaveLength(66);
  });
});
