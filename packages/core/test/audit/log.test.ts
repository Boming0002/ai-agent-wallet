// packages/core/test/audit/log.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/storage/db.js";
import { AuditLog } from "../../src/audit/log.js";

function freshLog() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  return { db, log: new AuditLog(db, () => 1700000000000) };
}

describe("AuditLog", () => {
  it("appends entries with chained hashes", () => {
    const { log } = freshLog();
    const a = log.append("init", { addr: "0xaa" });
    const b = log.append("propose", { id: "x" });
    expect(b.prevHash).toBe(a.thisHash);
  });

  it("verify() returns ok for clean chain", () => {
    const { log } = freshLog();
    log.append("init", {});
    log.append("propose", { id: "x" });
    expect(log.verify()).toEqual({ ok: true, headHash: expect.any(String) });
  });

  it("verify() detects tamper", () => {
    const { db, log } = freshLog();
    log.append("init", {});
    log.append("propose", { id: "x" });
    db.prepare("UPDATE audit_log SET payload_json = ? WHERE seq = 1").run('{"tampered":true}');
    const r = log.verify();
    expect(r.ok).toBe(false);
  });

  it("query supports kind filter and limit", () => {
    const { log } = freshLog();
    log.append("init", {});
    log.append("propose", {});
    log.append("propose", {});
    expect(log.query({ kind: "propose" }).length).toBe(2);
    expect(log.query({ limit: 1 }).length).toBe(1);
  });

  it("headHash() returns ZERO_HASH for empty log", () => {
    const { log } = freshLog();
    expect(log.headHash()).toBe("0x" + "0".repeat(64));
  });
});
