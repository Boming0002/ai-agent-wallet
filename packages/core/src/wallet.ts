// packages/core/src/wallet.ts
import type { ChainClient } from "./chain/client.js";
import type { AuditLog } from "./audit/log.js";
import type { PendingQueue } from "./approval/queue.js";
import type { Policy } from "./policy/schema.js";
import { evaluatePolicy } from "./policy/engine.js";
import { assessRisk } from "./risk/assess.js";
import type { ProposedTx, EthAddress, PolicyVerdict, PendingOp, RiskReport } from "./types.js";

export interface WalletDeps {
  address: EthAddress;
  chain: ChainClient;
  audit: AuditLog;
  queue: PendingQueue;
  getPolicy: () => Policy;
  hitlTtlMs?: number; // default 30 min
}

export interface ProposeResult {
  kind: PolicyVerdict["kind"];
  reason: string;
  rule?: string;
  opId?: string;
  risk: RiskReport;
}

export class Wallet {
  constructor(private deps: WalletDeps) {}

  get address() { return this.deps.address; }

  async dailySpentWei(): Promise<bigint> {
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const since = dayStart.getTime();
    const rows = this.deps.audit.query({ kind: "broadcast" });
    let sum = 0n;
    for (const r of rows) {
      if (r.ts >= since) {
        const v = (r.payload as { value?: string }).value;
        if (v) sum += BigInt(v);
      }
    }
    return sum;
  }

  async propose(tx: ProposedTx): Promise<ProposeResult> {
    const risk = await assessRisk(this.deps.chain, tx, this.deps.address);
    const dailySpent = await this.dailySpentWei();
    const verdict = evaluatePolicy(tx, this.deps.getPolicy(), dailySpent);

    this.deps.audit.append("propose", { tx });

    if (verdict.kind === "deny") {
      this.deps.audit.append("policy_deny", { tx, rule: verdict.rule, reason: verdict.reason });
      return { kind: "deny", rule: verdict.rule, reason: verdict.reason, risk };
    }
    if (!risk.simulation.ok) {
      this.deps.audit.append("risk_fail", { tx, revert: risk.simulation.revertReason, flags: risk.flags });
      return { kind: "deny", rule: "simulation_revert", reason: risk.simulation.revertReason, risk };
    }
    const ttl = this.deps.hitlTtlMs ?? 30 * 60 * 1000;
    const op = this.deps.queue.enqueue({ tx, policyVerdict: verdict, riskReport: risk, ttlMs: ttl });

    if (verdict.kind === "auto_approve") {
      this.deps.audit.append("auto_approve", { id: op.id });
      return { kind: "auto_approve", reason: verdict.reason, opId: op.id, risk };
    }
    this.deps.audit.append("enqueue_hitl", { id: op.id, expires_at: op.expiresAt });
    return { kind: "require_hitl", reason: verdict.reason, opId: op.id, risk };
  }
}
