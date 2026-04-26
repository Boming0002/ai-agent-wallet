// packages/core/src/pact/manager.ts
import type Database from "better-sqlite3";
import type { Pact, PactStatus, WeiString } from "../types.js";
import { PactCreateInput, PactCreateInputSchema } from "./schema.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function ulid16(): string {
  let id = "";
  for (let i = 0; i < 16; i++) id += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return id;
}

export class PactManager {
  constructor(private db: Database.Database, private now: () => number = Date.now) {}

  create(input: PactCreateInput): Pact {
    const v = PactCreateInputSchema.parse(input);
    const id = ulid16();
    const created = this.now();
    this.db.prepare(`
      INSERT INTO pacts (id, name, intent, policy_override_json, expires_at, max_total_value_wei, max_op_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      id, v.name, v.intent, JSON.stringify(v.policyOverride),
      v.expiresAtMs, v.maxTotalValueWei, v.maxOpCount ?? null, created,
    );
    return this.get(id)!;
  }

  get(id: string): Pact | undefined {
    const r = this.db.prepare(
      "SELECT id, name, intent, policy_override_json, expires_at, max_total_value_wei, max_op_count, spent_wei, op_count, status, created_at, decided_at, decided_by FROM pacts WHERE id = ?",
    ).get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id, name: r.name, intent: r.intent,
      policyOverride: JSON.parse(r.policy_override_json),
      expiresAt: r.expires_at, maxTotalValueWei: r.max_total_value_wei,
      maxOpCount: r.max_op_count ?? undefined,
      spentWei: r.spent_wei, opCount: r.op_count,
      status: r.status as PactStatus, createdAt: r.created_at,
      decidedAt: r.decided_at ?? undefined,
      decidedBy: r.decided_by ?? undefined,
    };
  }

  list(status?: PactStatus): Pact[] {
    const rows = (status
      ? this.db.prepare("SELECT id FROM pacts WHERE status = ? ORDER BY created_at DESC").all(status)
      : this.db.prepare("SELECT id FROM pacts ORDER BY created_at DESC").all()
    ) as Array<{ id: string }>;
    return rows.map((r) => this.get(r.id)!).filter(Boolean);
  }

  /** Atomically: status=active gate, expiry gate, increments, complete-on-cap. Throws if not consumable. */
  consume(id: string, valueWei: WeiString): Pact {
    const p = this.get(id);
    if (!p) throw new Error(`pact ${id} not found`);
    if (p.status !== "active") throw new Error(`pact ${id} is ${p.status}`);
    if (p.expiresAt <= this.now()) {
      this.transition(id, "expired", "system_expire");
      throw new Error(`pact ${id} expired`);
    }
    const nextSpent = (BigInt(p.spentWei) + BigInt(valueWei)).toString();
    const nextOps = p.opCount + 1;
    if (BigInt(nextSpent) > BigInt(p.maxTotalValueWei)) {
      throw new Error(`pact ${id} budget would be exceeded`);
    }
    if (p.maxOpCount !== undefined && nextOps > p.maxOpCount) {
      throw new Error(`pact ${id} op count would be exceeded`);
    }
    this.db.prepare("UPDATE pacts SET spent_wei = ?, op_count = ? WHERE id = ?")
      .run(nextSpent, nextOps, id);
    const completed =
      BigInt(nextSpent) === BigInt(p.maxTotalValueWei) ||
      (p.maxOpCount !== undefined && nextOps === p.maxOpCount);
    if (completed) this.transition(id, "completed", "system_complete");
    return this.get(id)!;
  }

  revoke(id: string): void {
    const p = this.get(id);
    if (!p) throw new Error(`pact ${id} not found`);
    if (p.status !== "active") throw new Error(`pact ${id} is ${p.status}`);
    this.transition(id, "revoked", "owner_revoke");
  }

  expireDue(): string[] {
    const now = this.now();
    const rows = this.db.prepare(
      "SELECT id FROM pacts WHERE status = 'active' AND expires_at <= ?",
    ).all(now) as Array<{ id: string }>;
    for (const r of rows) this.transition(r.id, "expired", "system_expire");
    return rows.map((r) => r.id);
  }

  private transition(id: string, to: PactStatus, by: NonNullable<Pact["decidedBy"]>): void {
    this.db.prepare(
      "UPDATE pacts SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?",
    ).run(to, this.now(), by, id);
  }
}
