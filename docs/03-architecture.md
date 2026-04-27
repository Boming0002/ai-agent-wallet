# Architecture Overview

> **DEMO SIMULATION NOTICE — MPC / KEY HANDLING**
> The wallet uses a Shamir-based 2-of-2 key split that is labeled a "demo simulation" throughout this codebase. It enforces the key-isolation threat model (Agent process cannot sign alone), but it is NOT a real Threshold Signature Scheme. A production TSS protocol (GG18, CMP, MP-ECDSA, FROST) never reconstructs the private key at any point in the protocol. This implementation briefly reconstructs the key in the trusted CLI process during signing, then zeros the buffer. This is documented in the keystore module, in the CLI banner, and here. Do not use in production without replacing the keystore module with a real TSS implementation.

---

## Layer Diagram

```
+-----------------------------------------------------------------------+
| Integration surfaces                                                  |
|                                                                       |
|  +----------------+     +----------------+     +-----------------+    |
|  |  MCP Server    |     |     CLI        |     |  Web Dashboard  |    |
|  |  (AI Agent)    |     |  (Owner)       |     |  (read-only)    |    |
|  |                |     |                |     |                 |    |
|  |  Tools:        |     |  Commands:     |     |  Pages:         |    |
|  |  get_balance   |     |  init          |     |  - Pending Ops  |    |
|  |  propose_tx    |     |  approve       |     |  - Audit Trail  |    |
|  |  simulate_tx   |     |  reject        |     |  - Policy State |    |
|  |  list_pending  |     |  status        |     |  - Balance      |    |
|  |  query_audit   |     |  audit         |     |                 |    |
|  |  get_policy    |     |  policy        |     |                 |    |
|  |  list_pacts    |     |  pact          |     |                 |    |
|  |  ...           |     |  daemon        |     |                 |    |
|  +-------+--------+     +-------+--------+     +--------+--------+    |
|          |                      |                       |             |
+----------|----------------------|-----------------------|-------------+
           |                      |                       |
           v                      v                       v
+-----------------------------------------------------------------------+
| Core library (packages/core)                                          |
|                                                                       |
|  +----------+  +----------+  +----------+  +-----------+  +--------+  |
|  | chain/   |  | keystore/|  | policy/  |  | risk/     |  |approval|  |
|  | Ethereum |  | MPC      |  | rule     |  | EOA/code  |  |HITL    |  |
|  | adapter  |  | Shamir   |  | engine   |  | sim check |  |queue   |  |
|  +----+-----+  +-----+----+  +----+-----+  +-----+-----+  +---+----+  |
|       |              |             |              |           |       |
|       v              v             v              v           v       |
|       +------+-------+-------+-----+--------+-----+-----------+       |
|              |               |              |                         |
|       +------v------+ +------v------+ +-----v-------+                  |
|       |  audit/     | |  storage/   | |  contracts/ |                  |
|       |  hash-chain | |  SQLite +   | |  multisig   |                  |
|       |  log        | |  enc keystr | |  (Solidity) |                  |
|       +-------------+ +-------------+ +-------------+                  |
|                                                                       |
+-----------------------------------------------------------------------+
                                     |
                                     v
                           Ethereum Sepolia RPC
```

---

## Module Responsibilities

| Module | Path | Responsibility | Key public API |
|---|---|---|---|
| `chain` | `packages/core/src/chain/` | RPC connection, gas estimation, broadcast, simulation | `getBalance`, `estimateGas`, `simulate`, `broadcast`, `getCode`, `getNonce` |
| `keystore` | `packages/core/src/keystore/` | Keypair generation, Shamir 2-of-2 split, partial-share holding, ECDSA signing, in-memory combine + zero | `generate`, `loadShare`, `signWithShares`, `address` |
| `policy` | `packages/core/src/policy/` | Declarative rule engine; evaluates a proposed tx against current rules, with optional Pact-layer merge | `evaluate(tx, context) → PolicyVerdict` |
| `risk` | `packages/core/src/risk/` | Pre-flight safety checks: `eth_getCode`, ERC-20 sanity, `eth_call` simulation, bytecode size | `assess(tx) → RiskReport` |
| `approval` | `packages/core/src/approval/` | HITL queue: enqueue pending ops, list, approve, reject, expire | `enqueue`, `list`, `approve`, `reject` |
| `audit` | `packages/core/src/audit/` | Append-only hash-chained log; chain verification | `append(entry)`, `verify()`, `query(filter)` |
| `storage` | `packages/core/src/storage/` | SQLite (WAL) for pending ops, audit log, pacts; encrypted JSON keystore | `db` handle, `keystoreFile` API |
| `contracts` | `packages/contracts/` | Solidity 2-of-3 multisig + Hardhat deploy/verify | `AIAgentMultisig.sol` |
| `mcp-server` | `packages/mcp-server/` | MCP adapter; exposes read + propose tools; holds `s_agent` in memory | MCP tool schemas |
| `cli` | `packages/cli/` | Owner-facing CLI; loads `s_owner` with passphrase on demand | commander commands |
| `dashboard` | `packages/dashboard/` | Read-only React + Vite UI; tiny Express server reads SQLite | n/a |

---

## Trust Boundaries

The system has three distinct trust zones:

**MCP server process (untrusted-ish).** This process holds `s_agent` decrypted in memory while running, because the Agent needs the wallet to be responsive. However, it cannot produce a valid signature alone — `s_agent` without `s_owner` is cryptographically inert. An attacker with full control of the MCP server process gains `s_agent` and read access to the pending ops queue and audit log. They cannot broadcast funds.

**CLI process (trusted).** The CLI loads `s_owner` only for the duration of a specific command (`approve`, `init`, `daemon start`). It prompts for the Owner passphrase interactively — the passphrase is never written to any file, environment variable, or argument list. The combine step (brief reconstruction of the full key) and the broadcast step both happen inside this process. When the command finishes, the decrypted share is zeroed from memory.

**SQLite and filesystem.** Treated as trusted for integrity (the audit hash chain provides tamper-evidence on top) but not trusted for confidentiality of `s_agent` (the MCP server has the unlock key in its environment). The Owner share's passphrase is never in the environment; that separation is the key isolation boundary.

**Sepolia RPC.** Trusted for liveness only. If the RPC provider is malicious, it could lie about account state. Mitigating this fully would require running a local Sepolia node; that is out of scope for this demo deployment and is documented as an acknowledged limit.

---

## Threat Model

### T1 — Agent Process Compromise (prompt injection, jailbreak, malicious tool result)

**Assumption:** An attacker fully controls the AI Agent's instruction context. They can make the Agent call arbitrary MCP tools.

**Mitigation:** `s_owner` is unreachable from the MCP server process. The Agent cannot complete a signature. All paths to broadcasting funds require the Owner's interactive CLI. Even if every MCP server process variable is exfiltrated, the attacker has `s_agent` and nothing else useful for signing.

### T2 — Address Hallucination

**Assumption:** The LLM may construct or recall a destination address that is plausible but wrong.

**Mitigations:** Pre-flight `eth_getCode` classification; ERC-20 sanity probe (`name()` / `symbol()` / `decimals()` via `eth_call`); address allowlist/denylist in the policy engine; contract method allowlist that restricts which `(address, selector)` pairs the Agent may call.

### T3 — Loop, Runaway, and Replay

**Assumption:** A buggy or compromised Agent may issue the same operation repeatedly, or replay a stale transaction.

**Mitigations:** Ethereum's native nonce (wallet manages nonces; Agent cannot override). Per-tx amount cap. Daily spending cap computed from the audit log on every evaluation (no separate counter that could drift). Pending ops TTL (30 minutes by default); expired ops remain in audit log. The CLI's `aiwallet audit` output surfaces high-frequency operation patterns immediately.

### T4 — Tampered Audit / Blame Shifting

**Assumption:** A party (compromised Agent or even the Operator) attempts to alter the historical record.

**Mitigation:** Audit log is hash-chained. Every row contains `prev_hash` and `this_hash = sha256(prev_hash || canonical_json(payload) || kind || ts)`. `aiwallet audit verify` recomputes every hash and reports any break. The chain head hash is exposed via MCP so external parties can snapshot it and detect later alterations.

### Out of Scope

- **Compromise of the Owner's host machine.** Root access plus the Owner passphrase defeats the wallet. This is documented as the fundamental trust boundary; the wallet is a single-host demo.
- **Malicious Sepolia RPC provider.** Lying about account state or simulation results is possible. Defense requires a local node. Not in scope.

---

## MPC Scheme

> See the banner at the top of this document.

Keypair generation produces a secp256k1 `(d, Q)`. The private scalar `d` is split using **Shamir Secret Sharing over GF(2^256)** into a 2-of-2 scheme, producing `s_agent` and `s_owner`. Neither share alone permits key reconstruction.

`s_agent` is encrypted with AES-256-GCM, key derived from `AGENT_SHARE_PASS` via scrypt (`N=2^17, r=8, p=1`), and stored at `<dataDir>/agent_share.enc`. The MCP server decrypts it at startup from its environment variable.

`s_owner` is encrypted the same way, passphrase prompted interactively at CLI usage. It is stored at `<dataDir>/owner_share.enc` and is only decrypted inside the CLI process for the duration of a signing operation.

**Combine location is the CLI, not the MCP server.** This is a deliberate design choice. If the MCP server were responsible for combining shares, it would need `s_owner` passed to it — even briefly — and the untrusted process would have access to both shares simultaneously. By placing combine in the CLI:
1. CLI reads both `agent_share.enc` and `owner_share.enc` from disk (single-host assumption; both files are in the same data directory).
2. CLI prompts interactively for the Owner passphrase.
3. CLI reconstructs `d` in a local `Buffer`, signs with ECDSA, calls `buf.fill(0)`.
4. CLI broadcasts directly to Sepolia RPC. The MCP server is never asked to broadcast.
5. The MCP server learns the outcome on its next `list_pending` or `query_audit` call.

The "demo simulation" label means: this threat model is sound, but the cryptographic guarantee is weaker than real TSS. A real TSS protocol would never assemble `d` in any single process. The implementation comment in `packages/core/src/keystore/` makes this explicit.

---

## Policy Engine

Rules live in `<dataDir>/policy.json`, editable via `aiwallet policy set` and readable (but not writable) via the MCP `get_policy` tool.

Three thresholds define three bands:

| Band | Condition | Verdict |
|---|---|---|
| auto | `value <= autoApproveMaxWei` | `auto_approve` (requires running daemon) |
| hitl | `autoApproveMaxWei < value <= perTxMaxWei` | `require_hitl` |
| deny | `value > perTxMaxWei`, or daily cap exceeded, or denylist hit, or allowlist miss | `deny` |

Evaluation order (first match wins for `deny`):
1. Denylist hit → `deny`
2. Allowlist set and `to` not in it → `deny`
3. Contract call and `(to, selector)` not in method allowlist → `deny`
4. `value > perTxMaxWei` → `deny`
5. `today_outflow + value > dailyMaxWei` → `deny`
6. `value <= autoApproveMaxWei` → `auto_approve`
7. Otherwise → `require_hitl`

Daily cap accounting uses the audit log as its source of truth: on each evaluation, the engine sums the `value` field of all `broadcast` entries in the current UTC day. There is no separate counter file that could drift out of sync.

When a transaction is proposed under a Pact, the global policy and the Pact's policy override are merged first (see Pact section below), and the merged policy is used for evaluation.

---

## Audit Hash-Chain Specification

```sql
CREATE TABLE audit_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,           -- unix ms
  kind       TEXT    NOT NULL,           -- see event type list below
  payload_json TEXT  NOT NULL,
  prev_hash  TEXT    NOT NULL,           -- hex sha256; "0000...0000" for seq=1
  this_hash  TEXT    NOT NULL
    -- sha256(prev_hash || canonical_json(payload) || kind || ts)
);
```

Canonical JSON: keys sorted lexicographically, no whitespace, BigInt values serialized as decimal strings. This definition is required for hash reproducibility — any deviation means `verify` will report a break.

**Event types:**

| Kind | Key payload fields |
|---|---|
| `init` | `address`, `chainId` |
| `policy_set` | `before`, `after` (full policy snapshots) |
| `daemon_start` / `daemon_stop` | `pid`, `autoApproveMaxWei` |
| `propose` | `op_id`, `to`, `value`, `data`, `nonce`, `pact_id?` |
| `policy_deny` | `op_id`, `rule`, `reason` |
| `risk_fail` | `op_id`, `flags`, `simulation` |
| `auto_approve` | `op_id` |
| `enqueue_hitl` | `op_id`, `expires_at` |
| `owner_approve` / `owner_reject` | `op_id`, `reason?` |
| `expire` | `op_id` |
| `broadcast` | `op_id`, `tx_hash`, `value`, `pact_id?` |
| `confirmed` | `op_id`, `tx_hash`, `block_number` |
| `pact_create` | `pact_id`, `name`, `intent`, `policy`, `completionConditions` |
| `pact_consume` | `pact_id`, `op_id`, `value`, `newSpent`, `newOpCount` |
| `pact_complete` | `pact_id`, `reason` (`budget_exhausted` or `op_count_reached`) |
| `pact_expire` | `pact_id` |
| `pact_revoke` | `pact_id`, `reason?` |

`aiwallet audit verify` walks the chain, recomputes every `this_hash`, and reports the chain head. The `--check-pacts` flag additionally cross-checks Pact `spentWei` against the sum of `pact_consume.value` entries and the sum of `broadcast.value` entries where `broadcast.pact_id` matches — these two sums must agree.

---

## HITL Approval Queue

### Lifecycle

```
proposed --[policy deny]---> rejected (terminal)
proposed --[risk fail]-----> rejected (terminal)
proposed --[auto_approve]--> signing --> broadcast (terminal)
proposed --[require_hitl]--> pending --[owner approve]--> signing --> broadcast
                               |--[owner reject]--------> rejected (terminal)
                               \--[TTL expire]----------> expired (terminal)
```

The daemon handles the `auto_approve` path. It runs as an Owner-launched process, holds `s_owner` decrypted in memory while active, and picks up pending rows that arrived via the `auto_approve` verdict. On daemon start and stop, prominent CLI banners are shown and `daemon_start` / `daemon_stop` audit entries are written.

### SQLite schema (table `pending_ops`)

```sql
CREATE TABLE pending_ops (
  id                   TEXT PRIMARY KEY,   -- 16-char ULID
  status               TEXT NOT NULL,      -- pending|approved|rejected|expired|broadcast
  tx_json              TEXT NOT NULL,
  policy_verdict_json  TEXT NOT NULL,
  risk_report_json     TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  expires_at           INTEGER NOT NULL,   -- now + 30 min default
  decided_at           INTEGER,
  decided_by           TEXT,               -- "owner" | "auto" | "system_expire"
  tx_hash              TEXT
);
```

The default TTL is 30 minutes. Expired operations are kept in the table with `status=expired`; they are never silently deleted. This ensures the audit log remains complete.

**Fresh signing on approval.** When the Owner runs `aiwallet approve <op_id>`, the system re-evaluates policy and risk against current chain state before prompting for the passphrase. If the state has changed (e.g., daily cap now exceeded by another operation that broadcast in the meantime, or the transaction would now revert), the approval is aborted with a structured error. This eliminates time-of-check / time-of-use gaps.

---

## Pacts — Task-Scoped Authorization

### What a Pact is

A Pact is the highest-level authorization primitive in the wallet. It represents a specific delegated task the Owner has scoped for the Agent: what the task is (free-text `intent`), what policy constraints apply specifically to it, and when it expires.

```ts
interface Pact {
  id: string;                          // ULID-like, 16 chars
  name: string;                        // human label, e.g. "supplier-X-q1-2026"
  intent: string;                      // free-text: "pay supplier X for Q1 invoices"
  policy: PactPolicyOverride;          // narrowing of global policy
  completionConditions: {
    expiresAt: number;                 // unix ms; mandatory
    maxTotalValueWei: string;          // budget cap; mandatory
    maxOpCount?: number;               // optional op count cap
  };
  spentWei: string;                    // cumulative successful broadcast value
  opCount: number;                     // cumulative successful broadcasts
  status: "active" | "completed" | "expired" | "revoked";
}
```

Both `expiresAt` and `maxTotalValueWei` are mandatory — the system does not permit indefinite or unlimited-budget Pacts. This is a deliberate design choice: the security value of Pacts comes from their self-limiting nature. A Pact without an expiry is just a more verbose policy rule.

### Why task-scoped authorization matters

The Owner's mental model when delegating a task is temporal and bounded: "Agent can pay this supplier for the next three days, up to 1000 USDC, maximum five transactions, then stop." A global policy file cannot express this cleanly — it either over-permissions (too broad, lasts forever) or under-permissions (too narrow to let the Agent work). Pacts encode that mental model directly.

A wider `perTxMax` is much safer inside a 2-day, 1000-USDC Pact than in the global policy file that applies indefinitely to all Agent operations. Pacts make aggressive delegation safe by making it temporary and auditable.

### Pact lifecycle

```
create (Owner CLI)
    |
    v
  active
    |
    +--- budget exhausted (spentWei >= maxTotalValueWei) --------> completed
    |
    +--- op count reached (opCount >= maxOpCount) ----------------> completed
    |
    +--- expiresAt <= now (lazy check on next operation) ---------> expired
    |
    +--- Owner explicit revoke (aiwallet pact revoke <id>) -------> revoked
```

Status transitions are checked lazily: an active Pact with `expiresAt` in the past is treated as expired on the next evaluation, and the database row is updated at that point. There is no background sweep; Pacts expire on demand.

### Proposal flow under a Pact

1. Agent calls `propose_tx({ pact_id, to, value, data })`.
2. Wallet loads the Pact. Missing Pact → deny `pact_not_found`.
3. Lazy expire check: if past `expiresAt`, update to `expired`, deny.
4. Status check: if not `active`, deny.
5. Budget check: if `spentWei + value > maxTotalValueWei`, deny.
6. Op count check: if `maxOpCount` set and `opCount + 1 > maxOpCount`, deny.
7. Merge the Pact's policy override with the global policy, taking the more restrictive value on each dimension.
8. Run normal policy evaluation against merged policy.
9. Run normal risk assessment.
10. On successful broadcast: atomically update `spentWei`, `opCount`, append `pact_consume` audit entry, and if conditions are met, transition to `completed` and append `pact_complete`.

### Policy intersection rules

| Field | Merged value |
|---|---|
| `perTxMaxWei` / `autoApproveMaxWei` | `min(pact, global)` |
| `addressDenylist` | union (either list can deny) |
| `addressAllowlist` | intersection if both non-empty; if global is empty, Pact's list is used |
| `contractMethodAllowlist` | intersection (both must permit) |
| `dailyMaxWei` | global only — Pact uses `maxTotalValueWei` instead |

### What Pacts are NOT in v1

- Not on-chain objects. No Solidity, no signed attestation. Pacts are local wallet records.
- No `executionPlan` field (Cobo's framing for a structured action DAG). v1 ships the constraint half; the plan half is future work.
- Not multi-Agent: each Pact authorizes one wallet identity (the MPC EOA).
- Not transferable: to change ownership or reassign, revoke and recreate.

### SQLite schema (table `pacts`)

```sql
CREATE TABLE pacts (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  intent                 TEXT NOT NULL,
  policy_override_json   TEXT NOT NULL,
  expires_at             INTEGER NOT NULL,
  max_total_value_wei    TEXT NOT NULL,
  max_op_count           INTEGER,
  spent_wei              TEXT NOT NULL DEFAULT '0',
  op_count               INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'active',
  created_at             INTEGER NOT NULL,
  decided_at             INTEGER,
  decided_by             TEXT           -- "system_complete"|"system_expire"|"owner_revoke"
);
CREATE INDEX idx_pacts_status ON pacts(status, expires_at);
```

---

## Solidity Multisig Contract

`AIAgentMultisig.sol` is a minimal 2-of-3 multisig contract written from scratch in ~150 lines of Solidity 0.8.24. It is not a Gnosis Safe fork; keeping it small and readable is a deliberate choice for an interview-context codebase.

### Storage

```solidity
address[3] public signers;            // immutable after construction
uint256 public required;              // 2
uint256 public nonce;                 // monotonic, prevents replay
mapping(bytes32 => mapping(address => bool)) public approvals;
```

### Flow

1. Deploy with three signer addresses. Canonical demo configuration: `signers[0]` = MPC EOA (the AI Agent's vote, requiring normal MPC approval flow), `signers[1]` = Owner hot EOA (separate key, Owner's machine), `signers[2]` = Recovery EOA (cold key, hardware wallet).
2. Any party constructs `op = (to, value, data, nonce)` and computes `digest = keccak256(abi.encode(address(this), op))`.
3. Each signer signs the digest with their EOA key. For `signers[0]`, this goes through the MPC HITL flow.
4. Anyone calls `execute(op, signatures[])` with at least 2 valid signatures (verified via `ECDSA.recover`).
5. Contract executes, increments nonce, emits `Executed(opHash, target, value)`.

The CLI commands `aiwallet multisig deploy / propose / sign / execute / status` drive this flow. For the single-machine demo, multiple signers can be represented by key files loaded via `--key-file`.

The contract is deployed to Sepolia and verified on Etherscan/Sourcify. The README links the verified contract address.

---

## Web Dashboard Architecture

The dashboard is a Vite + React 18 + TypeScript + Tailwind application served by a small Express backend (`packages/dashboard/server.ts`) that reads from the SQLite database.

**Pages:**
- **Overview (/)** — wallet address, native balance, ERC-20 balances of allowlisted tokens, current policy summary, audit chain head hash.
- **/pending** — table of pending ops with countdown timers, decoded transaction, policy verdict, risk report.
- **/audit** — paginated audit log with chain integrity status badge ("verified" or "broken at seq N").
- **/policy** — current policy rules as a readable card.

**Hard rule: read-only.** The Express server exposes no mutation endpoints. The dashboard workspace does not depend on the keystore module — this is enforced at the pnpm workspace level. No approval, signing, or policy change can originate from the web UI. All mutating operations go through the CLI.

This is not a shortcut; it is a deliberate security choice. The web browser is a larger attack surface than the CLI. Keeping approval in the CLI keeps the trusted surface minimal.

---

## Storage Layout

Default data directory: `~/.ai-agent-wallet/`, overridable via `--data-dir` or `AI_WALLET_DATA_DIR`.

```
~/.ai-agent-wallet/
├── agent_share.enc      # AES-256-GCM(scrypt(AGENT_SHARE_PASS))
├── owner_share.enc      # AES-256-GCM(scrypt(Owner passphrase, interactive))
├── policy.json          # current policy rules
├── wallet.sqlite        # pending_ops + audit_log + pacts (WAL mode)
└── addresses.json       # { address, chainId, contractMultisigAddress? }
```

**Encryption parameters:** scrypt `N=2^17, r=8, p=1`; AES-256-GCM with a random 96-bit nonce per encryption; authenticated header containing `version || N || r || p || salt`. These are hardcoded and documented — changing them without a migration path would break existing keystores.

**Concurrency:** SQLite in WAL mode. The MCP server and CLI may hold concurrent connections; writes (audit append, pending op update) are short transactions. Audit chain consistency under concurrent appends is maintained by computing `this_hash` inside the transaction that writes the row.

---

## Key Engineering Trade-offs

1. **MPC simulation, not real TSS.** The threat-model properties hold (Agent cannot sign alone); the cryptographic guarantee does not extend to "key is never assembled in any single process." This is documented at every layer and is the most significant gap between this demo and a production wallet. Replacing the keystore module with a real TSS implementation (GG18, CMP) is the most important piece of future work.

2. **Auto-approve requires a running Owner daemon.** Unattended low-value automation is possible, but only when the Owner has explicitly started the daemon process. The daemon holds `s_owner` decrypted in memory for its lifetime — a documented security trade-off the Owner must accept. Without the daemon, all operations are HITL. Default mode is full HITL.

3. **Combine happens in the CLI, not the MCP server.** This is slightly slower for the HITL flow (the Owner must run the CLI for each approval) but keeps the trusted surface tight. The alternative — letting the MCP server combine shares via IPC — would mean the untrusted process briefly sees `s_owner`.

4. **Dashboard is read-only.** No approval from the web UI. This reduces the browser-side attack surface at the cost of approvals being CLI-only. For a production product, a mobile push-notification approval flow would be the natural next step.

5. **SQLite, not Postgres.** Single-machine demo assumption. SQLite with WAL handles the concurrency requirements without introducing a client-server database dependency.

6. **ethers v6, not viem.** Either works for Sepolia; ethers was chosen for ecosystem familiarity. The chain adapter is isolated behind a module boundary, so swapping it is contained.

7. **Custom multisig, not a Gnosis fork.** ~150 lines of readable Solidity is more legible for an interview codebase than importing a battle-hardened but complex Gnosis Safe dependency. A production deployment would use Gnosis Safe or a similarly audited contract.

---

## Future Work

**Pact extensions:**
- `executionPlan`: the second half of the Cobo-style Pact framework — a structured, ordered list of intended actions the Agent commits to follow. v1 ships only the constraint half (policy + completion conditions). v2 would add the plan half plus a runtime checker that flags Agent deviations from the declared plan.
- Multi-Agent Pacts: one Pact authorizing a team of Agents with role-typed sub-quotas.
- On-chain Pact attestations: a signed Pact digest published to a bulletin-board contract for external auditors.
- Pact templates / Recipes: pre-canned Pact bodies for common tasks (token transfer with allowlist, recurring payment, DCA), aligned with Cobo's Recipes concept.

**Cryptography and key management:**
- Real TSS (GG18 / CMP / DKG-based MP-ECDSA): replace the demo Shamir simulation; private key never reconstructed.
- Two-group MPC architecture (Agent+Service / Human+Service), closer to Cobo's deployed model where the wallet provider is an unavoidable third party in both signing groups.
- Hardware wallet integration for `s_owner` (Ledger via WebHID / USB HID).
- Mnemonic-based recovery and key rotation.

**Reach:**
- Multi-chain (EVM L2s first, then Solana, BTC).
- Multi-framework SDK adapters: native LangChain / OpenAI Agents / CrewAI / Agno integrations beyond MCP.
- Skill-based install protocol so MCP-aware agents can discover and install the wallet without manual config edits.
- Mobile approval app for the Owner (push-notification HITL approvals).

**Operations and observability:**
- DEX / DeFi protocol-aware risk plugins (Uniswap V3 slippage, Aave health-factor checks).
- Real-time dashboard Pact widgets (USD spent / time remaining per active Pact).
- Signed audit-log attestations published to a public bulletin board for external verification.
- Programmable policy DSL (currently JSON-only).
- Push-notification channels for pending ops (Slack / Telegram / email / mobile).

---

*See [02-key-problems.md](02-key-problems.md) for a problem-focused explanation of these architectural decisions. See [04-ai-collaboration.md](04-ai-collaboration.md) for the development process behind this design.*
