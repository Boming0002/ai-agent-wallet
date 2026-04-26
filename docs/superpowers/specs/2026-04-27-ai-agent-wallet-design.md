# AI Agent Wallet — Design Spec

**Project:** `ai-agent-wallet`
**Author:** Boming
**Date:** 2026-04-27
**Status:** Approved (pending user review of this written spec)

---

## 1. Overview

A cryptocurrency wallet purpose-built for autonomous AI Agents (Claude Code, OpenClaw, Cursor, LangChain agents, etc.). The wallet runs on Ethereum's Sepolia testnet and exposes its capabilities through three integration surfaces sharing a single core engine:

1. **Core TypeScript library** — wallet logic, blockchain-agnostic where practical.
2. **MCP server** — the surface AI Agents talk to.
3. **CLI** — the surface a human Owner uses to approve, audit, and recover.

The wallet additionally ships a **Solidity multisig contract** (deployed to Sepolia, Etherscan-verified) for higher-stakes "treasury" flows, and a **read-only Web Dashboard** (Vite + React) for at-a-glance operational visibility.

The design is a direct response to the unique threat profile of AI Agent operators: probabilistic decision making, prompt-injection susceptibility, address hallucination, and the absence of intuitive risk recognition. The wallet enforces — at the protocol level rather than via prompting — that an AI Agent **cannot** unilaterally move funds, regardless of how thoroughly it has been jailbroken.

---

## 2. Target Users & Use Cases

### Primary user: the *AI Agent Operator*

A human (developer, trader, ops engineer, treasury manager) who delegates on-chain actions to one or more AI Agents on their behalf. Examples drawn directly from the assignment context: a Claude Code user who wants its agent to pay for gas / make small contract calls during automated workflows, or an OpenClaw operator running an autonomous Telegram bot that pays for services.

### Secondary stakeholders

- **The AI Agent itself** — a non-human principal that proposes operations and consumes balance/risk information.
- **Recovery key holder** — a separate party (or the Operator's hardware wallet) holding a third share, used only when MPC or HITL flows fail.
- **Auditor / reviewer** — anyone (compliance, post-incident investigator, an LLM eval harness) who later inspects what the Agent did and why.

### Representative scenarios

| # | Scenario | Why it matters |
|---|---|---|
| S1 | Agent autonomously pays a small gas-only transaction within preset policy | Demonstrates fast path: policy + risk pass → auto-sign → broadcast |
| S2 | Agent attempts a transaction that exceeds daily cap or hits a denylisted address | Demonstrates policy refusal with structured reason an LLM can interpret and self-correct |
| S3 | Agent is jailbroken via prompt injection and tries to exfiltrate funds | Demonstrates that the Owner share is unreachable; Agent cannot complete signing alone |
| S4 | Agent proposes a tx that fails simulation (would revert, or transfers token Agent doesn't own) | Demonstrates pre-flight risk catch; Agent receives diagnostic instead of broadcasting a doomed tx |
| S5 | Operator wakes up and reviews `aiwallet audit`, sees a tamper-evident log of every Agent decision | Demonstrates after-the-fact accountability |
| S6 | Treasury operation requires 2-of-3 signers (Agent + Owner + Recovery) via on-chain multisig | Demonstrates the Solidity contract path for high-stakes flows |

---

## 3. Goals & Non-Goals

### Goals (in scope, must ship)

- G1. Generate, persist, and use an Ethereum keypair where the private key is **never present in full form inside the AI Agent's process**.
- G2. Expose a clean MCP tool surface that an AI Agent can use to query state, propose transactions, and receive structured risk/policy/simulation information.
- G3. Enforce a configurable, declarative policy engine (per-tx limit, daily cap, address allow/deny lists, contract method allowlist) **before** any signing happens.
- G4. Pre-flight every transaction with `eth_call` simulation and structured risk classification (EOA vs contract, ERC-20 sanity, bytecode size, etc.).
- G5. Provide an HITL approval queue for transactions that policy/risk classifies as non-auto-approvable; Owner approves via CLI.
- G6. Maintain an append-only, hash-chained audit log of every operation (proposal, decision, signing, broadcast, error).
- G7. Ship a Solidity 2-of-3 multisig contract (`AIAgentMultisig`), deploy + verify on Sepolia, integrate as an alternative wallet mode.
- G8. Ship a read-only Web Dashboard for visualizing pending operations, audit trail, and policy state.
- G9. Provide a one-command e2e demo script that exercises the golden path end-to-end against a local fork or Sepolia.
- G10. Deliver four required design documents (personas, problems, architecture, AI collaboration log) plus a quickstart README.

### Non-Goals (explicit YAGNI)

- N1. **Production-grade threshold signature scheme (TSS)** such as GG18 or MP-ECDSA. The wallet uses a clearly-disclaimed *demo-level Shamir-based MPC simulation*. The threat-model story is identical; the cryptographic story is explicitly documented as instructional, not production. This is called out at every layer (README, architecture doc, code comments, CLI banner).
- N2. **Mainnet support.** Sepolia only.
- N3. **Multiple chains.** No L2s, no Solana, no BSC.
- N4. **DEX / Uniswap integration.** Not AI-Agent-specific; doesn't strengthen the narrative.
- N5. **On-chain identity / EAS attestations.** Same reason.
- N6. **Web-side signing or approval.** Dashboard is strictly read-only. All signing/approval happens via CLI to keep the attack surface minimal.
- N7. **Key recovery via social recovery / Shamir sharing across multiple human trustees.** A single Recovery share holder is sufficient for the demo.
- N8. **Hardware wallet integration.** Out of scope; mentioned in future-work section of architecture doc.
- N9. **Real-time mempool monitoring / private RPC.** Sepolia public RPC is fine.

---

## 4. Threat Model

The wallet's design is informed by four threats that are unique to or amplified for AI Agent operation:

### T1. Compromise of the Agent process (prompt injection, jailbreak, malicious tool output)

**Assumption:** An attacker can fully control the AI Agent's instructions. They can make the Agent attempt arbitrary MCP tool calls.

**Mitigation:** The Agent's process holds only `s_agent` (one of two MPC shares). It cannot reconstruct the full private key or produce a valid signature alone. All paths to broadcasting funds require the Owner share, which lives in a separate process (CLI), in encrypted form, behind a passphrase the Agent never sees.

### T2. Address hallucination

**Assumption:** The LLM may construct or recall a destination address that looks plausible but is wrong (off-by-one, looks-like-USDT-but-isn't, scam contract from training data).

**Mitigations:**
- Pre-flight risk module performs `eth_getCode` to distinguish EOA from contract, and (if contract) inspects bytecode size and known-token ERC-20 sanity (does it implement `name()`/`symbol()`/`decimals()`?).
- Address allowlist/denylist in policy engine.
- For ERC-20 token transfers, the wallet validates the token contract as a real ERC-20 before signing the `transfer()` call.

### T3. Loop / runaway / replay

**Assumption:** A buggy or compromised Agent may issue the same operation in a loop, or replay a previously-built transaction.

**Mitigations:**
- Daily spending cap in policy engine (counts cumulative outflow per UTC day).
- Per-tx amount cap.
- Audit log immediately surfaces `N` operations in time `T`; CLI offers `aiwallet rate-limit` view.
- Transactions use Ethereum's native nonce; the wallet rejects external `nonce` overrides from the Agent.

### T4. Tampered audit / blame shifting

**Assumption:** A compromised Agent or operator may try to alter the historical record to hide bad decisions.

**Mitigation:** The audit log is append-only and hash-chained: each entry includes `H(prev_entry || canonical_serialization(this_entry))`. The CLI ships an `aiwallet audit verify` command that walks the chain and reports any break. The chain root hash is also exposed via MCP for external attestation.

### Out of threat-model

- **Compromise of the Owner's host machine.** If the attacker has root on the Operator's laptop and has the passphrase (e.g., keylogged), the wallet cannot help. This is documented as the trust boundary.
- **Compromise of Sepolia RPC provider.** The wallet doesn't defend against a malicious RPC lying about state. (Acknowledged in architecture doc.)

---

## 5. Architecture

### 5.1 Layer diagram

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
|  |  ...           |     |  ...           |     |                 |    |
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

### 5.2 Module responsibilities

| Module | Path | Responsibility | Public API |
|---|---|---|---|
| `chain` | `packages/core/src/chain/` | RPC connection, gas estimation, broadcast, simulation | `getBalance`, `estimateGas`, `simulate`, `broadcast`, `getCode`, `getNonce` |
| `keystore` | `packages/core/src/keystore/` | Keypair generation, Shamir 2-of-2 split, partial-share holding, ECDSA partial signing, in-memory combine + zero | `generate`, `loadShare`, `signWithShares`, `address` |
| `policy` | `packages/core/src/policy/` | Declarative rule engine; evaluates a proposed tx against current rules | `evaluate(tx, context) → PolicyVerdict` |
| `risk` | `packages/core/src/risk/` | Pre-flight safety checks (code, ERC-20 sanity, simulation) | `assess(tx) → RiskReport` |
| `approval` | `packages/core/src/approval/` | HITL queue: enqueue, list, approve, reject, time out | `enqueue`, `list`, `approve`, `reject` |
| `audit` | `packages/core/src/audit/` | Append-only hash-chain log | `append(entry)`, `verify()`, `query(filter)` |
| `storage` | `packages/core/src/storage/` | SQLite for pending ops + audit; encrypted JSON for keystore | `db` handle, `keystoreFile` API |
| `contracts` | `packages/contracts/` | Solidity multisig contract + Hardhat deploy/verify scripts | `AIAgentMultisig.sol` |
| `mcp-server` | `packages/mcp-server/` | MCP adapter, exposes tools, holds Agent share in memory | tool schemas |
| `cli` | `packages/cli/` | Owner-facing CLI; loads Owner share with passphrase on demand | commander commands |
| `dashboard` | `packages/dashboard/` | Read-only React UI; reads from SQLite via small Express endpoint | n/a |

### 5.3 Trust boundaries

- **MCP server process (untrusted-ish).** Holds `s_agent`. May be controlled by a compromised LLM. Cannot sign alone.
- **CLI process (trusted).** Holds `s_owner` only when actively running an `approve`/`init` command. Loads the encrypted share with Owner's passphrase, performs the sign step, zeros memory, exits.
- **SQLite + filesystem.** Trusted for integrity (audit hash-chain provides tamper-evidence on top), not trusted for confidentiality of `s_agent` (it's stored encrypted but the MCP server has the unlock key in env).
- **Sepolia RPC.** Trusted for liveness only, not integrity (acknowledged limit).

---

## 6. MPC Scheme — Demo Level

### 6.1 What we implement

1. Generate a fresh secp256k1 keypair `(d, Q)`, derive Ethereum address from `Q`.
2. Use **Shamir Secret Sharing over GF(2^256)** to split `d` into a 2-of-2 scheme producing shares `s_agent` and `s_owner`.
3. `s_agent` is stored encrypted-at-rest in `<dataDir>/agent_share.enc`, unlocked at MCP server start with a passphrase from env (`AGENT_SHARE_PASS`).
4. `s_owner` is stored encrypted-at-rest in `<dataDir>/owner_share.enc`, unlocked only on demand by the CLI when the Owner runs `approve`, with an interactive passphrase prompt.
5. To sign: the wallet collects both shares into a short-lived buffer, reconstructs `d`, signs with standard ECDSA, **and immediately overwrites the buffer** (`buf.fill(0)`).

### 6.2 What this is NOT

This is **not** a real Threshold Signature Scheme. Real TSS protocols (GG18, GG20, CMP, MP-ECDSA, FROST for Schnorr) never reconstruct `d` at any point in the protocol — they exchange commitments and partial signatures over multiple rounds. Implementing one of those correctly is a multi-week cryptography project; getting it subtly wrong has historically led to real loss-of-funds incidents (e.g., the GG18/GG20 paper-vs-impl gap). Out of scope here.

### 6.3 Why the threat-model story still works

The Agent process *literally cannot complete a signature* without an explicit, passphrase-gated release of `s_owner` from the Owner's CLI. The combine step happens in the CLI process (during `approve`), not in the MCP server process. So even if the MCP server is fully compromised, an attacker has:
- `s_agent` (plus its decryption key from env)
- Network access to RPC

But not `s_owner`, and not the Owner's passphrase. They cannot produce a valid signature.

This is documented in `docs/03-architecture.md` with a clear "demo simulation" banner, and in `keystore/README.md` inline in the source.

### 6.4 Combine location: CLI, not MCP server

A subtle but important design decision. There are two options:
- (A) MCP server collects `s_owner` from CLI over IPC, combines, signs.
- (B) CLI collects `s_agent` from MCP server (or from disk), combines, signs.

We pick **(B)**. In (A), the MCP server (untrusted) gets to see `s_owner` even if briefly. In (B), the trusted CLI process is the only place `d` is ever reconstructed.

**Concrete handoff mechanism for HITL approve:**

1. CLI reads `agent_share.enc` directly from disk. Both shares are stored in the data directory; the CLI process has filesystem access. The encryption key for `agent_share.enc` is provided as `AGENT_SHARE_PASS` in the same `.env` the CLI loads (single-host demo assumption — documented).
2. CLI reads `owner_share.enc`, prompts the Owner for the Owner passphrase interactively (never in env, never in argv).
3. CLI reconstructs `d` in a `Buffer`, signs with ECDSA, immediately calls `buf.fill(0)`.
4. **CLI broadcasts** the signed transaction to RPC. The MCP server is never asked to broadcast (avoids a path where MCP server can be tricked into broadcasting an arbitrary tx).
5. CLI writes the `broadcast` audit entry, then returns. The MCP server learns about the result on its next `query_audit` or `list_pending` call.

This means the MCP server is a **read-mostly** process for the AI Agent: it can propose, query, and enqueue, but it cannot itself broadcast. All broadcasting happens from a CLI invocation (interactive Owner approve, or daemon for auto-approve mode — see §16.1).

---

## 7. Policy Engine

### 7.1 Declarative rule shape

Rules live in a JSON file (`<dataDir>/policy.json`) editable via CLI (`aiwallet policy set ...`) or read-only via MCP (`get_policy`). Schema:

```jsonc
{
  "version": 1,
  "perTxMaxWei":   "200000000000000000",   // 0.2 ETH — hard cap; over → deny
  "dailyMaxWei":   "500000000000000000",   // 0.5 ETH per UTC day — hard cap; over → deny
  "autoApproveMaxWei": "10000000000000000", // 0.01 ETH — at-or-below → auto_approve (if daemon)
  "addressAllowlist": ["0x..."],           // if non-empty, all `to` must match
  "addressDenylist":  ["0x..."],
  "contractMethodAllowlist": [
    { "address": "0x...", "selector": "0xa9059cbb" }  // ERC-20 transfer on this token
  ]
}
```

Three thresholds, three bands:

| Band | Range | Verdict |
|---|---|---|
| auto | `value <= autoApproveMaxWei` | `auto_approve` |
| hitl | `autoApproveMaxWei < value <= perTxMaxWei` | `require_hitl` |
| deny | `value > perTxMaxWei` (or daily-cap exceeded, or denylist hit, or allowlist miss) | `deny` |

`autoApproveMaxWei <= perTxMaxWei` is enforced at policy-set time. If `autoApproveMaxWei == 0`, auto-approve is effectively disabled (every operation is HITL).

### 7.2 Evaluation

`evaluate(tx, ctx)` returns:

```ts
type PolicyVerdict =
  | { kind: "deny"; rule: string; reason: string }
  | { kind: "auto_approve"; reason: string }
  | { kind: "require_hitl"; reason: string };
```

Evaluation order (first match wins for `deny`; `auto_approve` only if no deny applies):

1. denylist hit → `deny`
2. allowlist set and `to` not in it → `deny`
3. contract call (data non-empty) and `(to, selector)` not in method allowlist → `deny`
4. `value > perTxMaxWei` → `deny`
5. `today_outflow + value > dailyMaxWei` → `deny`
6. `value <= autoApproveMaxWei` → `auto_approve`
7. otherwise → `require_hitl`

### 7.3 Daily cap accounting

The audit log is the source of truth. On each evaluation, we sum the `value` field of every audit entry of kind `broadcast` whose `ts` falls in the current UTC day, and compare `today_outflow + value` to `dailyMaxWei`. No separate counter file (avoids drift / sync bugs). Pending (un-broadcast) operations are not counted; the next operation may still hit the cap and be denied.

---

## 8. Risk Module

### 8.1 Checks performed

For every `propose_tx`:

1. **Recipient classification:** `eth_getCode(to)` → EOA (`0x`) or contract (size > 2 chars). Reported in the verdict.
2. **ERC-20 sanity** (if `data` looks like an ERC-20 method call, i.e. selector matches `transfer`/`approve`/`transferFrom`):
   - Call `name()`, `symbol()`, `decimals()` via `eth_call`. If any reverts or returns non-decoded data, flag as `suspicious_token`.
   - Decode the recipient and amount; cross-check amount against `decimals()`-scaled human-readable form for log clarity.
3. **Simulation:** `eth_call` the proposed tx at current state. If it reverts, surface the revert reason. If it consumes more than `1.5 × estimateGas`, flag as `gas_anomaly`.
4. **Bytecode hint:** if the recipient is a contract whose bytecode size is unusually small (e.g., < 100 bytes), flag as `proxy_or_minimal` (could be a malicious proxy).

### 8.2 Output shape

```ts
type RiskReport = {
  recipient: { kind: "eoa" | "contract"; codeSize: number };
  erc20?:
    | { ok: true; name: string; symbol: string; decimals: number; amountHuman: string }
    | { ok: false; reason: string };
  simulation: { ok: true; gasUsed: bigint } | { ok: false; revertReason: string };
  flags: Array<"suspicious_token" | "gas_anomaly" | "proxy_or_minimal">;
};
```

The MCP `propose_tx` and `simulate_tx` tools both return this verbatim so the AI Agent can reason about it.

---

## 9. HITL Approval Queue

### 9.1 Lifecycle

```
proposed --[policy fail]--> rejected (terminal)
proposed --[risk fail]----> rejected (terminal)
proposed --[auto_approve]-> signing --> broadcast (terminal)
proposed --[require_hitl]-> pending --[owner approve]----> signing --> broadcast
                              |--[owner reject]----------> rejected (terminal)
                              \--[ttl expire]------------> expired (terminal)
```

### 9.2 SQLite schema (table `pending_ops`)

```sql
CREATE TABLE pending_ops (
  id TEXT PRIMARY KEY,                  -- 16-char ULID
  status TEXT NOT NULL,                 -- pending|approved|rejected|expired|broadcast
  tx_json TEXT NOT NULL,                -- canonical proposed tx
  policy_verdict_json TEXT NOT NULL,
  risk_report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,          -- now + 30 min by default
  decided_at INTEGER,
  decided_by TEXT,                      -- "owner" | "auto" | "system_expire"
  tx_hash TEXT                          -- on broadcast
);
```

### 9.3 TTL

Default 30 minutes. CLI's `status` command shows seconds remaining. Expired ops are not silently deleted; they remain visible with `status=expired` for audit.

### 9.4 Approval requires fresh signing

Approval doesn't pre-sign. When Owner runs `aiwallet approve <id>`:
1. Re-evaluate policy and risk against current state (in case time has passed). The current `nonce` is also re-fetched here.
2. If still acceptable, prompt for the Owner passphrase, load `s_owner` and `s_agent` (both decrypted in CLI memory; see §6.4 for the mechanism and the single-host trust assumption), combine, sign.
3. CLI broadcasts directly to RPC.
4. CLI appends audit entries: `owner_approve`, `broadcast` (with tx hash and `value`).

If re-evaluation fails (e.g., Sepolia state changed and now the tx would revert, or daily cap is now exceeded by another op that broadcast in the meantime), abort with a structured error. Owner can re-issue the proposal.

---

## 10. Audit Log

### 10.1 Hash chain

```sql
CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,                   -- propose|policy_deny|risk_fail|auto_approve|...
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,              -- hex; "0x" repeat for seq=1
  this_hash TEXT NOT NULL               -- sha256(prev_hash || canonical_json(payload)|| kind || ts)
);
```

Canonical JSON: keys sorted lexicographically, no whitespace, numbers as strings if `BigInt`.

### 10.2 Verification

`aiwallet audit verify` walks the chain and recomputes `this_hash` for each row. Any mismatch is a hard error. Output also reports the current chain head hash, which can be exposed externally (e.g., via MCP `query_audit`) so a third party can compare against a snapshot they took earlier.

### 10.3 Event types

| Kind | Payload (selected fields) |
|---|---|
| `init` | `address`, `chainId` |
| `policy_set` | `before`, `after` (full snapshots) |
| `daemon_start` / `daemon_stop` | `pid`, `autoApproveMaxWei` |
| `propose` | `op_id`, `to`, `value`, `data`, `nonce` |
| `policy_deny` | `op_id`, `rule`, `reason` |
| `risk_fail` | `op_id`, `flags`, `simulation` |
| `auto_approve` | `op_id` |
| `enqueue_hitl` | `op_id`, `expires_at` |
| `owner_approve` / `owner_reject` | `op_id`, `reason?` |
| `expire` | `op_id` |
| `broadcast` | `op_id`, `tx_hash`, `value` (the wei amount; daily-cap accounting reads this field) |
| `confirmed` | `op_id`, `tx_hash`, `block_number` |

---

## 11. Solidity Multisig Contract

### 11.1 Contract: `AIAgentMultisig.sol`

A minimal 2-of-3 multisig. Not a fork of Gnosis Safe — written from scratch (~150 lines) to demonstrate Solidity engineering and to keep the interview-readable codebase tight.

### 11.2 Storage

```solidity
address[3] public signers;            // immutable after construction
uint256 public required;              // immutable, 2
uint256 public nonce;                 // monotonic, prevents replay
mapping(bytes32 => mapping(address => bool)) public approvals;
```

### 11.3 Flow

1. At deploy time, the contract is parameterized with 3 signer addresses (`signers[3]`). The user chooses what these are; the canonical demo configuration is **signer[0] = MPC EOA** (signed via the normal MPC flow — the AI Agent's "single vote"), **signer[1] = Owner's hot EOA** (a separate key, kept on the Owner's machine), **signer[2] = Recovery EOA** (cold key — paper, hardware wallet, etc.).
2. Off-chain: any party constructs an operation `op = (to, value, data, nonce)` and computes `digest = keccak256(abi.encode(address(this), op))`.
3. Each authorized signer signs `digest` with their EOA key. For signer[0] (MPC EOA), this means going through the normal MPC HITL flow.
4. Anyone submits `execute(op, signatures[])` with at least 2 valid signatures (verified via `ECDSA.recover`).
5. Contract executes the call, increments nonce, emits `Executed(opHash, target, value)`.

The CLI supports importing arbitrary EOA keys via `aiwallet multisig sign --key-file <path>` so the dev demo can drive all three signers from one machine. In a real deployment, signer[1] and signer[2] live on separate machines.

### 11.4 Why a separate contract

Two complementary modes:
- **MPC EOA mode** — fast, the daily driver. One on-chain address. HITL queue replaces multisig semantics off-chain.
- **Multisig contract mode** — slow, transparent, on-chain. For "treasury" operations where the on-chain multisig contract holds the funds and execution requires explicit signatures from N parties.

The CLI exposes `aiwallet multisig deploy` to deploy on Sepolia and `aiwallet multisig propose/sign/execute` to drive the contract flow. The MCP server gets corresponding tools (`multisig_propose`, `multisig_sign`, `multisig_execute`).

### 11.5 Verification

Hardhat verify task posts source to Etherscan/Sourcify on Sepolia. The README links to the verified contract.

---

## 12. Web Dashboard

### 12.1 Stack

Vite + React 18 + TypeScript + Tailwind. Tiny Express server (`packages/dashboard/server.ts`) reads SQLite and serves JSON to the React app. Dashboard process is a separate pnpm workspace.

### 12.2 Pages

- **/ Overview** — wallet address, native balance, ERC-20 balances of policy-allowlisted tokens, current policy summary, audit chain head hash.
- **/pending** — table of pending ops with countdown, full decoded tx, policy verdict, risk report.
- **/audit** — paginated audit log, with chain integrity status badge ("verified" / "broken at seq N").
- **/policy** — current rules formatted as a readable card.

### 12.3 Hard rule: read-only

No mutation endpoints. Dashboard imports nothing from `keystore/`. This is enforced by the workspace dependency graph (the dashboard workspace doesn't depend on the keystore module).

---

## 13. MCP Tool Surface

| Tool | Purpose | Side effects |
|---|---|---|
| `get_address` | Returns wallet's Ethereum address | none |
| `get_balance` | Native ETH and (optional) ERC-20 token balances | none |
| `get_policy` | Returns current policy as JSON | none |
| `simulate_tx` | Run risk + simulate, return `RiskReport`, no signing | none |
| `propose_tx` | Run policy + risk; auto-broadcast or enqueue | may broadcast or enqueue |
| `list_pending` | Enumerate pending ops | none |
| `query_audit` | Paginated audit log + chain head hash | none |
| `multisig_status` | Pending op state in the multisig contract | none |
| `multisig_propose` | Create off-chain op + signature for the multisig | enqueues |
| `multisig_sign` | Add a signature to an existing multisig op | mutates |
| `multisig_execute` | Submit op + signatures on-chain | broadcasts |

The MCP server does **not** expose `set_policy`, `approve_pending`, or any mutator that grants funds-moving authority. Those live exclusively in the CLI.

---

## 14. CLI Surface (Owner)

| Command | Purpose |
|---|---|
| `aiwallet init` | Generate new wallet, MPC-split, write encrypted shares; print mnemonic-equivalent backup once |
| `aiwallet status` | Show address, balance, pending op count, policy summary, chain head |
| `aiwallet audit [--verify]` | Print audit log; optional integrity verification |
| `aiwallet policy show` / `policy set --file <path>` | Manage policy file |
| `aiwallet pending` | List pending ops |
| `aiwallet approve <op_id>` | Approve a pending op (passphrase-gated) |
| `aiwallet reject <op_id> [--reason]` | Reject a pending op |
| `aiwallet daemon start [--foreground]` / `daemon stop` / `daemon status` | Run/stop the auto-approve daemon |
| `aiwallet multisig deploy / propose / sign / execute / status` | Drive the on-chain multisig |

---

## 15. Storage & Persistence

### 15.1 Data directory

Default `~/.ai-agent-wallet/`, override via `--data-dir` or `AI_WALLET_DATA_DIR`.

```
~/.ai-agent-wallet/
├── agent_share.enc      # AES-256-GCM(scrypt(passphrase))
├── owner_share.enc
├── policy.json
├── wallet.sqlite        # pending_ops + audit_log
└── addresses.json       # { address, chainId, contractMultisigAddress? }
```

### 15.2 Encryption

- Key derivation: scrypt (`N=2^17, r=8, p=1`). Hardcoded params; documented.
- Cipher: AES-256-GCM. Random 96-bit nonce per encryption. Authenticated header: `version || N || r || p || salt`.

### 15.3 Concurrency

SQLite with WAL mode. The MCP server and CLI may both have a connection open. Writes are short. Audit append uses a small in-tx update of `audit_log` head hash to keep chaining consistent under concurrent access.

---

## 16. Data Flow Examples

### 16.1 Auto-approved transfer (golden path, with daemon)

**Pre-condition.** "Auto-approve" requires a running, Owner-launched approver daemon (`aiwallet daemon start`). Without the daemon, every proposal goes to HITL — there is no path to broadcasting funds without the Owner explicitly running a process. The daemon holds `s_owner` decrypted in memory for its lifetime; Owner explicitly accepts this trade-off for unattended low-value automation. Start/stop both emit conspicuous CLI banners and audit entries (`daemon_start`, `daemon_stop`).

1. Agent calls `propose_tx({to: 0xabc..., value: "5000000000000000"})` (0.005 ETH; at-or-below `autoApproveMaxWei`).
2. MCP server runs `policy.evaluate` → `auto_approve`.
3. MCP server runs `risk.assess` → recipient is EOA, simulation ok, no flags.
4. MCP server inserts a row in `pending_ops` with `status='pending'` and signals the daemon (file-descriptor watch on `pending_ops` table or a small UNIX socket — implementation choice during build, both work).
5. Daemon picks up the row. Re-runs policy + risk fresh (cheap) to defend against time-of-check / time-of-use.
6. Daemon combines shares (`s_owner` already in memory, reads `s_agent` from disk), signs, broadcasts. Zeros the combined buffer.
7. Daemon writes audit entries: `auto_approve`, `broadcast`.
8. Daemon updates `pending_ops` row to `status='broadcast'` with `tx_hash`.

If at any point in 5–7 the operation no longer passes (e.g., daily cap now exceeded), daemon writes `policy_deny` and leaves the row as `status='rejected'`.

### 16.2 HITL transfer

1. Agent calls `propose_tx({to: 0xdef..., value: "100000000000000000"})` (0.1 ETH; over auto-approve, under per-tx max).
2. Server: policy.evaluate → `require_hitl`.
3. Server: risk.assess → flags `suspicious_token` because to is a small-bytecode contract.
4. Server enqueues `pending`, returns `{ op_id, verdict, risk }` to Agent.
5. Owner sees notification (CLI poll or dashboard).
6. Owner runs `aiwallet approve <op_id>`; passphrase prompt.
7. CLI re-runs policy + risk (fresh state); shows operator a final summary; asks "approve? [y/N]".
8. On y: combine, sign, broadcast, audit entry.

### 16.3 Compromised Agent attempt

1. Attacker controls Agent. Tries `propose_tx({to: attacker_addr, value: <wallet balance>})`.
2. Policy: per-tx max exceeded → `deny`, audit entry. Or if under per-tx max but over daily cap → `deny`. If under both, `require_hitl`.
3. Even in the worst case (under all caps, on allowlist somehow), it goes to HITL. Owner sees it, rejects.
4. Attacker has no way to forge `s_owner` release.

---

## 17. Testing Strategy

### 17.1 Unit (vitest, per-module)

- `policy/`: rule evaluation matrix — table-driven tests with all rule combinations.
- `risk/`: mock RPC, ensure correct flag emission.
- `audit/`: chain integrity under append, tamper detection, concurrent appends.
- `keystore/`: round-trip Shamir split/combine; confirm partial share alone cannot sign; encryption round-trip.
- `approval/`: state machine transitions, TTL expiry.

### 17.2 Integration

- Spin up local Anvil (or Hardhat node) forked from Sepolia.
- E2E flow: init → fund → propose (deny case) → propose (HITL case) → approve → broadcast → audit verify.
- Multisig flow: deploy contract → propose → sign × 2 → execute → verify state.

### 17.3 Smoke (manual / CI optional)

- `scripts/e2e-demo.ts` runs the entire CLI + MCP flow against a local node and prints a transcript. Used as the screen-recordable demo.

### 17.4 Coverage target

- `packages/core/`: ≥ 75% line, ≥ 70% branch.
- Adapters and dashboard: smoke only (interactive).

---

## 18. Tech Stack Summary

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript 5.x | Type safety, ethers ecosystem |
| Runtime | Node 20 LTS | LTS; native fetch; stable |
| Workspace | pnpm | Fast, content-addressed, monorepo-friendly |
| Blockchain client | ethers v6 | Most mature for Sepolia |
| Crypto | `@noble/secp256k1`, `@noble/hashes` | Audited, no deps |
| SSS | Custom 2-of-2 over GF(2^256) | Simple enough to implement clearly; documented |
| Cipher | Node's `crypto` module (scrypt + AES-256-GCM) | Stdlib |
| DB | better-sqlite3 | Sync API, no async ceremony, good for SQLite |
| MCP | `@modelcontextprotocol/sdk` | Official |
| CLI | commander | Standard |
| Test | vitest | Fast, native ESM |
| Solidity | 0.8.24 + Hardhat | Ecosystem standard for verify+deploy |
| UI | Vite + React 18 + Tailwind | Fastest path to a presentable read-only UI |
| Lint/format | eslint + prettier | Standard |

---

## 19. Repository Layout

```
ai-agent-wallet/
├── README.md
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── docs/
│   ├── 01-personas-and-scenarios.md
│   ├── 02-key-problems.md
│   ├── 03-architecture.md
│   ├── 04-ai-collaboration.md
│   └── superpowers/specs/2026-04-27-ai-agent-wallet-design.md   (this file)
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── chain/
│   │   │   ├── keystore/
│   │   │   ├── policy/
│   │   │   ├── risk/
│   │   │   ├── approval/
│   │   │   ├── audit/
│   │   │   ├── storage/
│   │   │   └── index.ts
│   │   └── test/
│   ├── mcp-server/
│   │   ├── package.json
│   │   ├── src/index.ts
│   │   └── README.md
│   ├── cli/
│   │   ├── package.json
│   │   └── src/index.ts
│   ├── contracts/
│   │   ├── hardhat.config.ts
│   │   ├── contracts/AIAgentMultisig.sol
│   │   ├── scripts/deploy.ts
│   │   └── test/AIAgentMultisig.t.sol
│   └── dashboard/
│       ├── package.json
│       ├── server.ts
│       └── src/...
└── scripts/
    └── e2e-demo.ts
```

---

## 20. Key Engineering Trade-offs (To Document Honestly)

1. **MPC simulation, not real TSS.** Demo-level. Threat-model story holds; cryptography story is explicitly instructional.
2. **Auto-approve requires daemon process.** Owner must run an authenticated long-lived process to enable unattended low-value automation. Default mode is full HITL.
3. **Combine happens in CLI, not MCP server.** Slightly slower UX for HITL but keeps `d` reconstruction strictly inside the trusted process.
4. **Dashboard read-only.** No approval from web UI; reduces attack surface.
5. **SQLite, not Postgres.** Single-machine demo; no need for client/server DB.
6. **ethers v6, not viem.** Either works; ethers chosen for familiarity.
7. **Custom multisig contract, not Gnosis fork.** ~150 lines of readable Solidity is more interview-legible than auditing a Gnosis fork.

---

## 21. Open Questions / Risks

- **Hardhat Sepolia verify reliability.** Sometimes flaky. Mitigation: include both Hardhat verify and a sourcify fallback.
- **MCP SDK API churn.** The MCP TypeScript SDK has evolved; pin to a known-good version.
- **better-sqlite3 native module on Node 20.** Confirm prebuilt binary availability for Apple Silicon during scaffold.
- **Daemon mode UX.** Communicating "auto-approve mode is on" to Owner clearly enough to avoid surprise. Mitigation: prominent banner, audit log entry on every daemon start/stop.

---

## 22. What Ships in v1 vs Future Work

### v1 (this submission)

- Everything above marked as Goal.
- All four required documents.
- Verified Sepolia contract.
- Working dashboard.
- E2E demo script.
- README quickstart.

### Future work (mentioned in architecture doc, not built)

- Real TSS (GG18 / CMP / DKG-based MP-ECDSA).
- Hardware wallet for `s_owner` (e.g., signer integration via WebHID/USB HID).
- Mnemonic-based recovery & key rotation (`aiwallet recover` would re-import from a written-down backup or apply a recovery-key-signed rotation tx).
- Multi-chain (EVM L2s first, then non-EVM).
- DEX integration with policy-aware slippage rules.
- Programmable policy DSL (currently JSON).
- Signed audit-log attestations published to a public bulletin board for external verification.
- Mobile push notifications for pending ops.
