// packages/core/src/audit/log.ts
import type Database from "better-sqlite3";
import type { AuditEntry, AuditEventKind, Hex } from "../types.js";
import { canonicalJson, chainHash, ZERO_HASH } from "./hash-chain.js";

export interface QueryOpts {
  kind?: AuditEventKind;
  limit?: number;
  sinceSeq?: number;
}

export class AuditLog {
  constructor(private db: Database.Database, private now: () => number = Date.now) {}

  headHash(): Hex {
    const row = this.db
      .prepare("SELECT this_hash FROM audit_log ORDER BY seq DESC LIMIT 1")
      .get() as { this_hash: string } | undefined;
    return (row?.this_hash ?? ZERO_HASH) as Hex;
  }

  append(kind: AuditEventKind, payload: Record<string, unknown>): AuditEntry {
    const ts = this.now();
    const prev = this.headHash();
    const hash = chainHash(prev, kind, ts, payload);
    const info = this.db
      .prepare(
        "INSERT INTO audit_log(ts, kind, payload_json, prev_hash, this_hash) VALUES (?,?,?,?,?)",
      )
      .run(ts, kind, canonicalJson(payload), prev, hash);
    return {
      seq: Number(info.lastInsertRowid),
      ts,
      kind,
      payload,
      prevHash: prev,
      thisHash: hash,
    };
  }

  query(opts: QueryOpts = {}): AuditEntry[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.kind) { where.push("kind = ?"); args.push(opts.kind); }
    if (opts.sinceSeq !== undefined) { where.push("seq > ?"); args.push(opts.sinceSeq); }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const limit = opts.limit ?? 1000;
    const rows = this.db
      .prepare(`SELECT seq, ts, kind, payload_json, prev_hash, this_hash FROM audit_log ${whereSql} ORDER BY seq ASC LIMIT ?`)
      .all(...args, limit) as Array<{
        seq: number; ts: number; kind: string;
        payload_json: string; prev_hash: string; this_hash: string;
      }>;
    return rows.map((r) => ({
      seq: r.seq, ts: r.ts,
      kind: r.kind as AuditEventKind,
      payload: JSON.parse(r.payload_json),
      prevHash: r.prev_hash as Hex,
      thisHash: r.this_hash as Hex,
    }));
  }

  verify(): { ok: true; headHash: Hex } | { ok: false; brokenAt: number; expected: Hex; got: Hex } {
    const rows = this.db
      .prepare("SELECT seq, ts, kind, payload_json, prev_hash, this_hash FROM audit_log ORDER BY seq ASC")
      .all() as Array<{ seq: number; ts: number; kind: string;
        payload_json: string; prev_hash: string; this_hash: string }>;
    let prev: Hex = ZERO_HASH;
    for (const r of rows) {
      if (r.prev_hash !== prev) {
        return { ok: false, brokenAt: r.seq, expected: prev, got: r.prev_hash as Hex };
      }
      const payload = JSON.parse(r.payload_json);
      const expected = chainHash(prev, r.kind, r.ts, payload);
      if (expected !== r.this_hash) {
        return { ok: false, brokenAt: r.seq, expected, got: r.this_hash as Hex };
      }
      prev = r.this_hash as Hex;
    }
    return { ok: true, headHash: prev };
  }
}
