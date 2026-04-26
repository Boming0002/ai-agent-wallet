import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version(version) VALUES (1);

CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  this_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS pending_ops (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  tx_json TEXT NOT NULL,
  policy_verdict_json TEXT NOT NULL,
  risk_report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  tx_hash TEXT,
  pact_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_ops(status, created_at);

CREATE TABLE IF NOT EXISTS pacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  intent TEXT NOT NULL,
  policy_override_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_total_value_wei TEXT NOT NULL,
  max_op_count INTEGER,
  spent_wei TEXT NOT NULL DEFAULT '0',
  op_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_pacts_status ON pacts(status, expires_at);
`;

export function openDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "wallet.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_V1);
  return db;
}
