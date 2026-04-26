// packages/core/test/approval/queue.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/storage/db.js";
import { PendingQueue } from "../../src/approval/queue.js";

function freshQueue() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  let now = 1700000000000;
  const q = new PendingQueue(db, () => now);
  return { db, q, advance: (ms: number) => { now += ms; } };
}

describe("PendingQueue", () => {
  it("enqueues with status pending and id", () => {
    const { q } = freshQueue();
    const op = q.enqueue({
      tx: { to: "0x" + "aa".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "x" },
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "21000" }, flags: [] },
      ttlMs: 60_000,
    });
    expect(op.status).toBe("pending");
    expect(op.id).toMatch(/^[A-Z0-9]{16}$/);
  });

  it("list filters by status", () => {
    const { q } = freshQueue();
    q.enqueue({ tx: { to: "0x" + "11".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "" } as any,
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "0" }, flags: [] },
      ttlMs: 1000 });
    expect(q.list("pending").length).toBe(1);
    expect(q.list("rejected").length).toBe(0);
  });

  it("approve transitions to broadcast on tx hash", () => {
    const { q } = freshQueue();
    const op = q.enqueue({ tx: { to: "0x" + "11".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "" } as any,
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "0" }, flags: [] },
      ttlMs: 1000 });
    q.markBroadcast(op.id, "0x" + "ab".repeat(32) as any, "owner");
    const op2 = q.get(op.id);
    expect(op2?.status).toBe("broadcast");
    expect(op2?.txHash).toBe("0x" + "ab".repeat(32));
  });

  it("expireDue marks past-due pending as expired", () => {
    const { q, advance } = freshQueue();
    const op = q.enqueue({ tx: { to: "0x" + "11".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "" } as any,
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "0" }, flags: [] },
      ttlMs: 1000 });
    advance(2000);
    const expired = q.expireDue();
    expect(expired).toEqual([op.id]);
    expect(q.get(op.id)?.status).toBe("expired");
  });
});
