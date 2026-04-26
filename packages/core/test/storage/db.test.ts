import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/storage/db.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("openDatabase", () => {
  it("creates schema on first open", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
    const db = openDatabase(dir);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(["audit_log", "pacts", "pending_ops", "schema_version"]);
    db.close();
  });

  it("is idempotent on second open", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
    openDatabase(dir).close();
    const db = openDatabase(dir);
    const ver = db.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(ver.version).toBe(1);
    db.close();
  });

  it("uses WAL journal", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
    const db = openDatabase(dir);
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
    db.close();
  });
});
