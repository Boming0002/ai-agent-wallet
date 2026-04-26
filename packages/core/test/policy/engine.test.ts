// packages/core/test/policy/engine.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../../src/policy/engine.js";
import { defaultPolicy } from "../../src/policy/schema.js";
import type { ProposedTx } from "../../src/types.js";

const tx = (overrides: Partial<ProposedTx> = {}): ProposedTx => ({
  to: "0x" + "11".repeat(20) as `0x${string}`,
  value: "0",
  data: "0x",
  ...overrides,
});

describe("evaluatePolicy", () => {
  it("denies on denylist", () => {
    const p = { ...defaultPolicy(), addressDenylist: ["0x" + "11".repeat(20)] as any };
    const v = evaluatePolicy(tx(), p, 0n);
    expect(v.kind).toBe("deny");
  });

  it("denies when allowlist non-empty and to not in it", () => {
    const p = { ...defaultPolicy(), addressAllowlist: ["0x" + "22".repeat(20)] as any };
    expect(evaluatePolicy(tx(), p, 0n).kind).toBe("deny");
  });

  it("denies above perTxMaxWei", () => {
    const p = defaultPolicy();
    const v = evaluatePolicy(tx({ value: "999000000000000000000" }), p, 0n);
    expect(v.kind).toBe("deny");
  });

  it("denies when dailySpent + value > dailyMaxWei", () => {
    const p = defaultPolicy();
    const dailySpent = BigInt("499000000000000000"); // 0.499 ETH already
    const v = evaluatePolicy(tx({ value: "5000000000000000" }), p, dailySpent); // +0.005 -> 0.504 > 0.5
    expect(v.kind).toBe("deny");
  });

  it("auto-approves at-or-below autoApproveMaxWei", () => {
    const v = evaluatePolicy(tx({ value: "1000000000000000" }), defaultPolicy(), 0n);
    expect(v.kind).toBe("auto_approve");
  });

  it("requires HITL between autoApprove and perTxMax", () => {
    const v = evaluatePolicy(tx({ value: "100000000000000000" }), defaultPolicy(), 0n);
    expect(v.kind).toBe("require_hitl");
  });

  it("denies contract call not in method allowlist", () => {
    const tok = ("0x" + "ab".repeat(20)) as `0x${string}`;
    const p = { ...defaultPolicy(), contractMethodAllowlist: [{ address: tok, selector: "0xa9059cbb" }] };
    const v = evaluatePolicy(
      tx({ to: ("0x" + "cd".repeat(20)) as any, data: "0xa9059cbb00" as any }),
      p as any,
      0n,
    );
    expect(v.kind).toBe("deny");
  });

  it("allows method on allowlist", () => {
    const tok = ("0x" + "ab".repeat(20)) as `0x${string}`;
    const p = { ...defaultPolicy(), contractMethodAllowlist: [{ address: tok, selector: "0xa9059cbb" }] };
    const v = evaluatePolicy(
      tx({ to: tok, data: "0xa9059cbb000000" as any, value: "0" }),
      p as any,
      0n,
    );
    expect(v.kind).toBe("auto_approve");
  });
});
