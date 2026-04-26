// packages/core/test/audit/hash-chain.test.ts
import { describe, it, expect } from "vitest";
import { canonicalJson, chainHash } from "../../src/audit/hash-chain.js";

describe("canonicalJson", () => {
  it("sorts keys lexicographically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("recurses into nested objects", () => {
    expect(canonicalJson({ z: { b: 1, a: 2 } })).toBe('{"z":{"a":2,"b":1}}');
  });
  it("preserves array order", () => {
    expect(canonicalJson({ x: [3, 1, 2] })).toBe('{"x":[3,1,2]}');
  });
  it("renders bigint as string", () => {
    expect(canonicalJson({ v: 10n })).toBe('{"v":"10"}');
  });
});

describe("chainHash", () => {
  it("is deterministic", () => {
    const a = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    const b = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    expect(a).toBe(b);
  });
  it("changes when prev changes", () => {
    const a = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    const b = chainHash("0x" + "1".repeat(64), "init", 1, { x: 1 });
    expect(a).not.toBe(b);
  });
  it("returns 0x-prefixed 64-hex string", () => {
    const h = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
