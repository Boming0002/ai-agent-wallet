// packages/core/src/approval/queue.ts
import type Database from "better-sqlite3";
import type { PendingOp, PendingStatus, PolicyVerdict, ProposedTx, RiskReport, Hex } from "../types.js";
import { canTransition } from "./states.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function ulid16(): string {
  let id = "";
  for (let i = 0; i < 16; i++) id += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return id;
}

export interface EnqueueArgs {
  tx: ProposedTx;
  policyVerdict: PolicyVerdict;
  riskReport: RiskReport;
  ttlMs: number;
  pactId?: string;
}

export class PendingQueue {
  constructor(private db: Database.Database, private now: () => number = Date.now) {}

  enqueue(args: EnqueueArgs): PendingOp {
    const id = ulid16();
    const created = this.now();
    const expires = created + args.ttlMs;
    this.db.prepare(`
      INSERT INTO pending_ops(id, status, tx_json, policy_verdict_json, risk_report_json, created_at, expires_at, pact_id)
      VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      JSON.stringify(args.tx),
      JSON.stringify(args.policyVerdict),
      JSON.stringify(args.riskReport),
      created,
      expires,
      args.pactId ?? null,
    );
    return {
      id, status: "pending",
      tx: args.tx, policyVerdict: args.policyVerdict, riskReport: args.riskReport,
      createdAt: created, expiresAt: expires,
      ...(args.pactId !== undefined ? { pactId: args.pactId } : {}),
    };
  }

  get(id: string): PendingOp | undefined {
    const r = this.db.prepare(
      "SELECT id,status,tx_json,policy_verdict_json,risk_report_json,created_at,expires_at,decided_at,decided_by,tx_hash,pact_id FROM pending_ops WHERE id=?",
    ).get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id, status: r.status as PendingStatus,
      tx: JSON.parse(r.tx_json), policyVerdict: JSON.parse(r.policy_verdict_json),
      riskReport: JSON.parse(r.risk_report_json),
      createdAt: r.created_at, expiresAt: r.expires_at,
      decidedAt: r.decided_at ?? undefined, decidedBy: r.decided_by ?? undefined,
      txHash: r.tx_hash ?? undefined,
      pactId: r.pact_id ?? undefined,
    };
  }

  list(status?: PendingStatus): PendingOp[] {
    const sql = status
      ? "SELECT id FROM pending_ops WHERE status=? ORDER BY created_at DESC"
      : "SELECT id FROM pending_ops ORDER BY created_at DESC";
    const rows = (status ? this.db.prepare(sql).all(status) : this.db.prepare(sql).all()) as Array<{ id: string }>;
    return rows.map((r) => this.get(r.id)!).filter(Boolean);
  }

  private transition(id: string, to: PendingStatus, decidedBy: PendingOp["decidedBy"], txHash?: Hex) {
    const op = this.get(id);
    if (!op) throw new Error(`pending op ${id} not found`);
    if (!canTransition(op.status, to)) throw new Error(`illegal transition ${op.status} -> ${to}`);
    this.db.prepare(
      "UPDATE pending_ops SET status=?, decided_at=?, decided_by=?, tx_hash=COALESCE(?, tx_hash) WHERE id=?",
    ).run(to, this.now(), decidedBy ?? null, txHash ?? null, id);
  }

  approveOnly(id: string, decidedBy: "owner" | "auto" = "owner") { this.transition(id, "approved", decidedBy); }
  reject(id: string, decidedBy: "owner" = "owner") { this.transition(id, "rejected", decidedBy); }
  markBroadcast(id: string, txHash: Hex, decidedBy: "owner" | "auto" = "owner") {
    this.transition(id, "broadcast", decidedBy, txHash);
  }

  expireDue(): string[] {
    const now = this.now();
    const rows = this.db.prepare(
      "SELECT id FROM pending_ops WHERE status='pending' AND expires_at <= ?",
    ).all(now) as Array<{ id: string }>;
    const stmt = this.db.prepare(
      "UPDATE pending_ops SET status='expired', decided_at=?, decided_by='system_expire' WHERE id=?",
    );
    for (const r of rows) stmt.run(now, r.id);
    return rows.map((r) => r.id);
  }
}
