// packages/core/test/pact/manager.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/storage/db.js";
import { PactManager } from "../../src/pact/manager.js";

function fresh() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  let now = 1700000000000;
  const m = new PactManager(db, () => now);
  return { db, m, advance: (ms: number) => { now += ms; } };
}

describe("PactManager", () => {
  it("creates an active Pact with zero spent / opCount", () => {
    const { m } = fresh();
    const p = m.create({
      name: "supplier-x", intent: "pay supplier",
      policyOverride: {}, expiresAtMs: 1700000000000 + 86400000,
      maxTotalValueWei: "1000000000000000000",
    });
    expect(p.status).toBe("active");
    expect(p.spentWei).toBe("0");
    expect(p.opCount).toBe(0);
    expect(p.id).toMatch(/^[A-Z0-9]{16}$/);
  });

  it("rejects creation with policyOverride wider than global is the engine's job (PactManager.create only validates shape)", () => {
    const { m } = fresh();
    expect(() => m.create({
      name: "x", intent: "x",
      policyOverride: { perTxMaxWei: "abc" } as any,
      expiresAtMs: 1700000086400000, maxTotalValueWei: "100",
    })).toThrow();
  });

  it("consume increments spent + opCount and leaves active when below caps", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "1000000000000000000",
      maxOpCount: 5,
    });
    m.consume(p.id, "100");
    const p2 = m.get(p.id)!;
    expect(p2.spentWei).toBe("100");
    expect(p2.opCount).toBe(1);
    expect(p2.status).toBe("active");
  });

  it("consume marks completed when budget exhausted", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "100",
    });
    m.consume(p.id, "100");
    expect(m.get(p.id)?.status).toBe("completed");
  });

  it("consume marks completed when maxOpCount reached", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "1000000",
      maxOpCount: 2,
    });
    m.consume(p.id, "1");
    m.consume(p.id, "1");
    expect(m.get(p.id)?.status).toBe("completed");
  });

  it("consume after completion throws", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "10",
    });
    m.consume(p.id, "10");
    expect(() => m.consume(p.id, "1")).toThrow();
  });

  it("expireDue marks past-deadline pacts as expired", () => {
    const { m, advance } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000000000 + 1000, maxTotalValueWei: "1000",
    });
    advance(2000);
    expect(m.expireDue()).toEqual([p.id]);
    expect(m.get(p.id)?.status).toBe("expired");
  });

  it("revoke transitions active → revoked", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "100",
    });
    m.revoke(p.id);
    expect(m.get(p.id)?.status).toBe("revoked");
  });

  it("list filters by status", () => {
    const { m } = fresh();
    const a = m.create({ name: "a", intent: "x", policyOverride: {}, expiresAtMs: 1700000086400000, maxTotalValueWei: "100" });
    const b = m.create({ name: "b", intent: "x", policyOverride: {}, expiresAtMs: 1700000086400000, maxTotalValueWei: "100" });
    m.revoke(b.id);
    expect(m.list("active").map((p) => p.id)).toEqual([a.id]);
    expect(m.list("revoked").map((p) => p.id)).toEqual([b.id]);
  });
});
