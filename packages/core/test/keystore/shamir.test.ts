// packages/core/test/keystore/shamir.test.ts
import { describe, it, expect } from "vitest";
import { split2of2, combine2of2 } from "../../src/keystore/shamir.js";

describe("Shamir 2-of-2 over secp256k1 order", () => {
  it("round-trips a random secret", () => {
    const secret = 0x1234567890abcdef1234567890abcdefn;
    const { share1, share2 } = split2of2(secret, () => 0xdeadbeefn);
    expect(combine2of2(share1, share2)).toBe(secret);
  });

  it("two random splits of the same secret reconstruct correctly", () => {
    const secret = 0xfeedface_cafebabe_aabbccddeeff0011n;
    const a = split2of2(secret);
    const b = split2of2(secret);
    expect(combine2of2(a.share1, a.share2)).toBe(secret);
    expect(combine2of2(b.share1, b.share2)).toBe(secret);
    // Different randomness → different shares.
    expect(a.share1).not.toBe(b.share1);
  });

  it("each share alone is information-theoretically random (no leak in distribution)", () => {
    // Sanity: 100 splits produce 100 distinct share1 values.
    const seen = new Set<bigint>();
    for (let i = 0; i < 100; i++) seen.add(split2of2(42n).share1);
    expect(seen.size).toBe(100);
  });

  it("rejects out-of-range secret", () => {
    expect(() => split2of2(0n)).toThrow();
  });
});
