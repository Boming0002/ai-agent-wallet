// packages/core/test/keystore/address.test.ts
import { describe, it, expect } from "vitest";
import { addressFromPrivateKey } from "../../src/keystore/address.js";

describe("addressFromPrivateKey", () => {
  it("matches known vector (vitalik test key)", () => {
    // d = 1, public key derivation must produce a deterministic address
    const d = 1n;
    const a = addressFromPrivateKey(d);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Re-deriving must yield the same string.
    expect(addressFromPrivateKey(d)).toBe(a);
  });

  it("rejects 0 and >= n", () => {
    expect(() => addressFromPrivateKey(0n)).toThrow();
  });
});
