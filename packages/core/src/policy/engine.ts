// packages/core/src/policy/engine.ts
import type { ProposedTx, PolicyVerdict } from "../types.js";
import type { Policy } from "./schema.js";

function eq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
function selectorOf(data: string): string | null {
  if (data.length < 10) return null;
  return data.slice(0, 10).toLowerCase();
}

export function evaluatePolicy(tx: ProposedTx, policy: Policy, dailySpentWei: bigint): PolicyVerdict {
  // 1. denylist
  if (policy.addressDenylist.some((a) => eq(a, tx.to))) {
    return { kind: "deny", rule: "addressDenylist", reason: `recipient ${tx.to} is denylisted` };
  }
  // 2. allowlist
  if (policy.addressAllowlist.length > 0 && !policy.addressAllowlist.some((a) => eq(a, tx.to))) {
    return { kind: "deny", rule: "addressAllowlist", reason: `recipient ${tx.to} not in allowlist` };
  }
  // 3. method allowlist (only when calling contract / data non-empty)
  if (tx.data && tx.data !== "0x") {
    const sel = selectorOf(tx.data);
    const ok = policy.contractMethodAllowlist.some((e) => eq(e.address, tx.to) && sel === e.selector.toLowerCase());
    if (!ok) {
      return {
        kind: "deny",
        rule: "contractMethodAllowlist",
        reason: `(${tx.to}, ${sel ?? "?"}) not in method allowlist`,
      };
    }
  }
  const value = BigInt(tx.value);
  // 4. per-tx max
  if (value > BigInt(policy.perTxMaxWei)) {
    return { kind: "deny", rule: "perTxMaxWei", reason: `value ${value} > perTxMaxWei` };
  }
  // 5. daily cap
  if (dailySpentWei + value > BigInt(policy.dailyMaxWei)) {
    return {
      kind: "deny",
      rule: "dailyMaxWei",
      reason: `daily spend ${dailySpentWei + value} would exceed cap ${policy.dailyMaxWei}`,
    };
  }
  // 6. auto-approve
  if (value <= BigInt(policy.autoApproveMaxWei)) {
    return { kind: "auto_approve", reason: `value ${value} <= autoApproveMaxWei` };
  }
  // 7. HITL
  return { kind: "require_hitl", reason: "value above auto-approve threshold but within per-tx max" };
}
