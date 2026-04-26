// packages/core/test/pact/intersect.test.ts
import { describe, it, expect } from "vitest";
import { intersectPolicy } from "../../src/pact/intersect.js";
import { defaultPolicy } from "../../src/policy/schema.js";

describe("intersectPolicy", () => {
  it("returns global when override is empty", () => {
    expect(intersectPolicy(defaultPolicy(), {})).toEqual(defaultPolicy());
  });
  it("uses min for perTxMax / autoApproveMax", () => {
    const merged = intersectPolicy(defaultPolicy(), {
      perTxMaxWei: "100", autoApproveMaxWei: "50",
    });
    expect(merged.perTxMaxWei).toBe("100");
    expect(merged.autoApproveMaxWei).toBe("50");
  });
  it("intersects allowlists when both non-empty", () => {
    const merged = intersectPolicy(
      { ...defaultPolicy(), addressAllowlist: ["0x" + "11".repeat(20), "0x" + "22".repeat(20)] as any },
      { addressAllowlist: ["0x" + "22".repeat(20)] as any },
    );
    expect(merged.addressAllowlist).toEqual(["0x" + "22".repeat(20)]);
  });
  it("uses pact's allowlist when global is empty", () => {
    const merged = intersectPolicy(defaultPolicy(), { addressAllowlist: ["0x" + "33".repeat(20)] as any });
    expect(merged.addressAllowlist).toEqual(["0x" + "33".repeat(20)]);
  });
  it("unions denylists", () => {
    const merged = intersectPolicy(
      { ...defaultPolicy(), addressDenylist: ["0x" + "aa".repeat(20)] as any },
      { addressDenylist: ["0x" + "bb".repeat(20)] as any },
    );
    expect(merged.addressDenylist.sort()).toEqual([
      "0x" + "aa".repeat(20), "0x" + "bb".repeat(20),
    ].sort());
  });
});
