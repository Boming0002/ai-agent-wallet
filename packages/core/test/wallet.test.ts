// packages/core/test/wallet.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../src/storage/db.js";
import { AuditLog } from "../src/audit/log.js";
import { PendingQueue } from "../src/approval/queue.js";
import { defaultPolicy } from "../src/policy/schema.js";
import { Wallet as WalletFacade } from "../src/wallet.js";
import { EthersChainClient } from "../src/chain/client.js";
import { MockProvider } from "./helpers/mock-chain.js";
import { PactManager } from "../src/pact/manager.js";

function fresh() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  const audit = new AuditLog(db, () => 1700000000000);
  const queue = new PendingQueue(db, () => 1700000000000);
  const pactMgr = new PactManager(db, () => 1700000000000);
  const policy = defaultPolicy();
  const chain = new EthersChainClient(new MockProvider({}) as any);
  const w = new WalletFacade({
    address: "0x" + "ee".repeat(20) as any,
    audit, queue, chain, getPolicy: () => policy, pactManager: pactMgr,
  });
  return { w, audit, queue, pactMgr };
}

describe("Wallet façade", () => {
  it("propose: deny → audit policy_deny, no enqueue", async () => {
    const { w, audit, queue } = fresh();
    const r = await w.propose({ to: "0x" + "ee".repeat(20) as any, value: "999000000000000000000", data: "0x" as any });
    expect(r.kind).toBe("deny");
    expect(queue.list().length).toBe(0);
    expect(audit.query({ kind: "policy_deny" }).length).toBe(1);
  });

  it("propose: auto_approve → enqueue with verdict auto_approve, audit propose+enqueue_hitl=0+auto_approve+1", async () => {
    const { w, audit, queue } = fresh();
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1000000000000000", data: "0x" as any });
    expect(r.kind).toBe("auto_approve");
    expect(queue.list().length).toBe(1);
    expect(audit.query({ kind: "auto_approve" }).length).toBe(1);
  });

  it("propose: require_hitl → enqueue and emit enqueue_hitl audit", async () => {
    const { w, audit, queue } = fresh();
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "100000000000000000", data: "0x" as any });
    expect(r.kind).toBe("require_hitl");
    expect(queue.list("pending").length).toBe(1);
    expect(audit.query({ kind: "enqueue_hitl" }).length).toBe(1);
  });
});

describe("Wallet façade — Pact integration", () => {
  it("denies when pact_id missing", async () => {
    const { w } = fresh();
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1", data: "0x" as any },
      "NONEXISTENT00000");
    expect(r.kind).toBe("deny");
    expect(r.rule).toBe("pact_not_found");
  });

  it("denies when pact would exceed budget", async () => {
    const { w, pactMgr } = fresh();
    const p = pactMgr.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000000000 + 86400000,
      maxTotalValueWei: "100",
    });
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1000", data: "0x" as any }, p.id);
    expect(r.kind).toBe("deny");
    expect(r.rule).toBe("pact_budget_exceeded");
  });

  it("auto-approves under pact when within bounds and global auto-approves", async () => {
    const { w, pactMgr } = fresh();
    const p = pactMgr.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000000000 + 86400000,
      maxTotalValueWei: "100000000000000000",
    });
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1000000000000000", data: "0x" as any }, p.id);
    expect(r.kind).toBe("auto_approve");
  });
});
