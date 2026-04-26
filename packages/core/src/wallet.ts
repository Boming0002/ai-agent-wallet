// packages/core/src/wallet.ts
import type { ChainClient } from "./chain/client.js";
import type { AuditLog } from "./audit/log.js";
import type { PendingQueue } from "./approval/queue.js";
import type { PactManager } from "./pact/manager.js";
import type { Policy } from "./policy/schema.js";
import { evaluatePolicy } from "./policy/engine.js";
import { assessRisk } from "./risk/assess.js";
import { intersectPolicy } from "./pact/intersect.js";
import type { ProposedTx, EthAddress, PolicyVerdict, RiskReport } from "./types.js";

export interface WalletDeps {
  address: EthAddress;
  chain: ChainClient;
  audit: AuditLog;
  queue: PendingQueue;
  getPolicy: () => Policy;
  pactManager: PactManager;
  hitlTtlMs?: number;
}

export interface ProposeResult {
  kind: PolicyVerdict["kind"];
  reason: string;
  rule?: string;
  opId?: string;
  pactId?: string;
  risk?: RiskReport;
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

  async propose(tx: ProposedTx, pactId?: string): Promise<ProposeResult> {
    this.deps.audit.append("propose", { tx, pact_id: pactId });
    const value = BigInt(tx.value);

    let effectivePolicy = this.deps.getPolicy();
    if (pactId) {
      // Lazy expire pass.
      this.deps.pactManager.expireDue();
      const pact = this.deps.pactManager.get(pactId);
      if (!pact) {
        const reason = `pact ${pactId} not found`;
        this.deps.audit.append("policy_deny", { tx, rule: "pact_not_found", reason });
        return { kind: "deny", rule: "pact_not_found", reason };
      }
      if (pact.status !== "active") {
        const reason = `pact ${pactId} is ${pact.status}`;
        this.deps.audit.append("policy_deny", { tx, rule: "pact_not_active", reason });
        return { kind: "deny", rule: "pact_not_active", reason };
      }
      // Budget gate.
      if (BigInt(pact.spentWei) + value > BigInt(pact.maxTotalValueWei)) {
        const reason = `would exceed pact budget ${pact.maxTotalValueWei}`;
        this.deps.audit.append("policy_deny", { tx, rule: "pact_budget_exceeded", reason });
        return { kind: "deny", rule: "pact_budget_exceeded", reason };
      }
      // Op count gate.
      if (pact.maxOpCount !== undefined && pact.opCount + 1 > pact.maxOpCount) {
        const reason = `would exceed pact op count ${pact.maxOpCount}`;
        this.deps.audit.append("policy_deny", { tx, rule: "pact_ops_exceeded", reason });
        return { kind: "deny", rule: "pact_ops_exceeded", reason };
      }
      effectivePolicy = intersectPolicy(this.deps.getPolicy(), pact.policyOverride);
    }

    const dailySpent = await this.dailySpentWei();
    const verdict = evaluatePolicy(tx, effectivePolicy, dailySpent);
    if (verdict.kind === "deny") {
      this.deps.audit.append("policy_deny", { tx, rule: verdict.rule, reason: verdict.reason });
      return { kind: "deny", rule: verdict.rule, reason: verdict.reason };
    }

    const risk = await assessRisk(this.deps.chain, tx, this.deps.address);
    if (!risk.simulation.ok) {
      this.deps.audit.append("risk_fail", { tx, revert: risk.simulation.revertReason, flags: risk.flags });
      return { kind: "deny", rule: "simulation_revert", reason: risk.simulation.revertReason, risk };
    }

    const ttl = this.deps.hitlTtlMs ?? 30 * 60 * 1000;
    const op = this.deps.queue.enqueue({
      tx, policyVerdict: verdict, riskReport: risk, ttlMs: ttl,
      ...(pactId !== undefined ? { pactId } : {}),
    });

    if (verdict.kind === "auto_approve") {
      this.deps.audit.append("auto_approve", { id: op.id, pact_id: pactId });
      return {
        kind: "auto_approve", reason: verdict.reason, opId: op.id, risk,
        ...(pactId !== undefined ? { pactId } : {}),
      };
    }
    this.deps.audit.append("enqueue_hitl", { id: op.id, expires_at: op.expiresAt, pact_id: pactId });
    return {
      kind: "require_hitl", reason: verdict.reason, opId: op.id, risk,
      ...(pactId !== undefined ? { pactId } : {}),
    };
  }
}
