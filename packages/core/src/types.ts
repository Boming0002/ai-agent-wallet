// packages/core/src/types.ts

/** Wei amounts are passed as strings (decimal) to avoid JSON BigInt issues. */
export type WeiString = string;

/** Hex prefixed with 0x. */
export type Hex = `0x${string}`;

export type EthAddress = Hex;

export interface ProposedTx {
  to: EthAddress;
  value: WeiString;
  data: Hex;
  /** Optional override; the wallet always uses its own nonce if omitted. */
  nonce?: number;
  /** Optional gas limit override. */
  gasLimit?: WeiString;
}

export type PolicyVerdict =
  | { kind: "deny"; rule: string; reason: string }
  | { kind: "auto_approve"; reason: string }
  | { kind: "require_hitl"; reason: string };

export interface RiskReport {
  recipient: { kind: "eoa" | "contract"; codeSize: number };
  erc20?:
    | { ok: true; name: string; symbol: string; decimals: number; amountHuman: string }
    | { ok: false; reason: string };
  simulation:
    | { ok: true; gasUsed: WeiString }
    | { ok: false; revertReason: string };
  flags: Array<"suspicious_token" | "gas_anomaly" | "proxy_or_minimal">;
}

export type AuditEventKind =
  | "init"
  | "policy_set"
  | "daemon_start"
  | "daemon_stop"
  | "propose"
  | "policy_deny"
  | "risk_fail"
  | "auto_approve"
  | "enqueue_hitl"
  | "owner_approve"
  | "owner_reject"
  | "expire"
  | "broadcast"
  | "confirmed";

export interface AuditEntry {
  seq: number;
  ts: number;
  kind: AuditEventKind;
  payload: Record<string, unknown>;
  prevHash: Hex;
  thisHash: Hex;
}

export type PendingStatus = "pending" | "approved" | "rejected" | "expired" | "broadcast";

export interface PendingOp {
  id: string;
  status: PendingStatus;
  tx: ProposedTx;
  policyVerdict: PolicyVerdict;
  riskReport: RiskReport;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  decidedBy?: "owner" | "auto" | "system_expire";
  txHash?: Hex;
  pactId?: string;
}

// ---------------------------------------------------------------------------
// Pact types (task-scoped authorization)
// ---------------------------------------------------------------------------

export type PactStatus = "active" | "completed" | "expired" | "revoked";

export interface PactPolicyOverride {
  perTxMaxWei?: WeiString;
  autoApproveMaxWei?: WeiString;
  addressAllowlist?: EthAddress[];
  addressDenylist?: EthAddress[];
  contractMethodAllowlist?: { address: EthAddress; selector: Hex }[];
}

export interface Pact {
  id: string;
  name: string;
  intent: string;
  policyOverride: PactPolicyOverride;
  expiresAt: number;
  maxTotalValueWei: WeiString;
  maxOpCount?: number;
  spentWei: WeiString;
  opCount: number;
  status: PactStatus;
  createdAt: number;
  decidedAt?: number;
  decidedBy?: "system_complete" | "system_expire" | "owner_revoke";
}
