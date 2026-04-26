// packages/core/test/policy/schema.test.ts
import { describe, it, expect } from "vitest";
import { PolicySchema, defaultPolicy } from "../../src/policy/schema.js";

describe("PolicySchema", () => {
  it("accepts default policy", () => {
    expect(PolicySchema.parse(defaultPolicy())).toBeTruthy();
  });
  it("requires autoApproveMaxWei <= perTxMaxWei", () => {
    expect(() =>
      PolicySchema.parse({ ...defaultPolicy(), autoApproveMaxWei: "10", perTxMaxWei: "5" }),
    ).toThrow();
  });
  it("rejects non-decimal wei strings", () => {
    expect(() => PolicySchema.parse({ ...defaultPolicy(), perTxMaxWei: "0xff" })).toThrow();
  });
});
