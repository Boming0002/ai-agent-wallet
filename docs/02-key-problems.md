# Three Key Problems and Our Solutions

This document describes the three security and usability challenges that a wallet purpose-built for AI Agent operation must solve, and explains how this system addresses each one. These are not generic wallet engineering problems — they are specific to the threat profile of an autonomous LLM process holding financial authority.

---

## Problem 1: Unbypassable Key Isolation and Threshold Authorization

### Why it matters

A compromised AI Agent — one that has been jailbroken, given malicious instructions via prompt injection, or fed a deceptive tool response — should not be able to move funds. Full stop. This constraint needs to hold at the protocol level, not at the prompting level. Telling an LLM "don't transfer funds to unknown addresses" is not a security measure; it is a hint, and hints can be overridden.

The standard approach of storing a private key in an environment variable available to the Agent process provides zero key isolation. The key is there; the Agent can use it. Any attacker who can influence the Agent's instructions can influence how the key is used. The threat model for an AI Agent includes adversaries who can inject arbitrary instructions — this is not a theoretical edge case, it is the normal surface for an Agent that processes external documents, web pages, or API responses.

### How we solve it

The wallet uses a 2-of-2 Shamir-based MPC scheme to split the wallet's private key `d` into two shares, `s_agent` and `s_owner`, before either is ever persisted. Neither share alone can reconstruct `d` or produce a valid signature.

`s_agent` lives in the MCP server process, encrypted at rest. The MCP server is the surface the Agent talks to — it can be considered untrusted, because the Agent's instructions flow through it. Even if the MCP server is fully compromised, the attacker has at most `s_agent` plus the encryption key for it. That is insufficient to sign.

`s_owner` lives encrypted in the CLI process's data directory. It is decrypted only when the Owner explicitly runs an `approve`, `daemon start`, or similar command — and only with an interactive passphrase prompt that is never written to any file or environment variable. The combine step (where `d` is briefly reconstructed to sign) happens entirely inside the CLI process, which the Agent has no access to. The combined buffer is zeroed immediately after signing.

This architecture means the security guarantee is not "hope the Agent won't try to transfer funds." It is "the Agent literally cannot complete a signature." Every path to broadcasting funds goes through the Owner CLI.

**Demo-level honesty:** This is not a real Threshold Signature Scheme. Production TSS protocols like GG18, CMP, or MP-ECDSA never reconstruct `d` at any point; they exchange partial commitments and produce partial signatures that are combined into a valid signature without any party ever knowing the full key. Implementing one of those correctly is a multi-week cryptography project with serious security engineering requirements. What this system ships is a clearly-labeled *simulation* of the key isolation story: the threat-model properties hold (Agent process cannot sign alone), the cryptographic properties do not (key is briefly reconstructed in the trusted CLI process). This is documented prominently at every layer of the stack, and in the architecture document.

---

## Problem 2: Bounded Delegation — Task-Scoped Authorization with Explicit Completion Conditions

### Why it matters

A global policy file with static thresholds ("per-tx max 0.2 ETH, daily cap 0.5 ETH, allowlist: empty") does not match how an Operator actually thinks about delegating a task to an Agent.

The Operator's mental model is not "permanently grant this Agent the ability to send up to 0.2 ETH per transaction, forever." It is: "let the Agent pay supplier X for the next three days, up to a 1000 USDC budget, maximum five transactions, then stop automatically." Those are fundamentally different authorizations. A static global policy tries to approximate the second with the first, but the approximation is lossy — it tends toward over-permissioning (the Agent retains the authority after the task completes) and under-specification (there's no way to distinguish "authorized to pay supplier X" from "authorized to make any 0.2 ETH transaction").

Over time, a wallet managed with only a global policy accumulates stale permissions. The Operator may have set a high per-tx max for a time-sensitive task months ago and forgotten to lower it. The Agent retains that authority indefinitely.

### How we solve it

**Pacts** are first-class authorization objects in this wallet. A Pact represents a specific delegated task with explicit boundaries: a free-text `intent` describing what the task is, a policy override that narrows (never widens) the global policy for operations performed under this Pact, and explicit completion conditions — an `expiresAt` timestamp, a `maxTotalValueWei` budget, and an optional `maxOpCount`.

Creating a Pact requires the Owner (via CLI). The Agent cannot create or modify Pacts; it can only *propose transactions under* an existing active Pact by passing `pact_id` to `propose_tx`. This keeps authority creation strictly on the trusted side of the trust boundary.

When the Agent proposes a transaction under a Pact, the system evaluates the proposal against the Pact's conditions *before* running the global policy:

- If the Pact has passed its `expiresAt`, the proposal is denied immediately. The Operator doesn't need to remember to revoke it.
- If the cumulative spend plus this transaction's value would exceed `maxTotalValueWei`, the proposal is denied. The budget is self-enforcing.
- If `maxOpCount` is set and this would be one operation too many, the proposal is denied.

If the Pact's conditions pass, the wallet computes an *intersection* of the Pact's policy override and the global policy — taking the more restrictive of each dimension — and runs the normal policy evaluation against that merged policy. A Pact can shrink the allowlist, lower the per-tx cap, or lower the auto-approve threshold. It cannot grant permissions that don't already exist globally.

On a successful broadcast under a Pact, the wallet atomically updates the Pact's `spentWei` and `opCount`, and appends a `pact_consume` audit entry. If the post-update spend or op count meets a completion condition, the Pact transitions to `completed` and appends a `pact_complete` audit entry. No explicit revocation is needed; the Pact enforces its own expiry.

Every Pact lifecycle event — creation, each consumption, completion, expiry, owner revocation — lands in the hash-chained audit log. This means the Operator can look at any operation in the audit log and see precisely which Pact authorized it, what the budget was at that point, and how much remained. The authorization breadcrumb is complete.

**What Pacts are not (in v1):** Pacts are off-chain wallet records, not on-chain objects. They do not carry an `executionPlan` — a structured DAG of intended actions the Agent commits to follow (a concept from Cobo's Agentic Wallet framework). That is future work. v1 ships the *constraint half* of the Pact framework (policy + completion conditions); the Agent's actual sequence of `propose_tx` calls executes the intent, and the Pact's role is to constrain it.

---

## Problem 3: Runtime Defenses for AI-Specific Failure Modes, Plus Tamper-Evident Audit

### Why it matters

Two categories of failure need addressing beyond key isolation and delegation.

The first is **AI-specific runtime failure modes**: address hallucination (the LLM constructs a plausible but wrong destination address), ERC-20 misidentification (the Agent believes a contract is a legitimate token but it isn't, or the token contract has been replaced), replay loops (a buggy Agent proposes the same operation repeatedly), and runaway spending (the Agent issues more calls than intended due to a logic error in its context). These failures don't require an attacker; they can happen from ordinary LLM misbehavior or a bug in the Agent's tool-use logic.

The second is **tamper-evident audit**: after the fact, the Operator needs to be able to prove that the historical record has not been altered. A simple log file can be edited. An append-only database without integrity checks can be truncated. If the Operator (or an auditor, or a regulator) wants to verify that what the log says is what actually happened, there needs to be a cryptographic guarantee layered on top of the storage.

### How we solve it

**Pre-flight risk checks** run on every `propose_tx`:

- `eth_getCode` classifies the destination as EOA or contract. A recipient with unexpectedly small bytecode (under ~100 bytes) is flagged as `proxy_or_minimal` — a known signal for malicious proxy contracts.
- For calls that look like ERC-20 operations (selector matches `transfer`, `approve`, or `transferFrom`), the risk module probes the token contract by calling `name()`, `symbol()`, and `decimals()` via `eth_call`. If any of these revert or return undecodable data, the token is flagged as `suspicious_token`. The human-readable transfer amount is computed against `decimals()` and included in the risk report so the Agent and the Owner can verify it makes sense.
- `eth_call` simulation runs the proposed transaction against current chain state. If it reverts, the revert reason is decoded and returned to the Agent. If gas consumption is more than 1.5x the estimate, it is flagged as `gas_anomaly`.
- A contract method allowlist in the policy engine ensures that only pre-authorized `(address, selector)` pairs are permitted for contract calls. An Agent proposing a call to an unlisted method on a token contract will be denied.

**Replay and runaway protection** is layered:

- Ethereum's native nonce prevents replay of already-broadcast transactions. The wallet manages nonces internally and does not accept nonce overrides from the Agent.
- The per-tx amount cap and daily cap (the latter computed from the audit log on every evaluation, with no separate counter that could drift) limit cumulative outflow.
- Pending operations have a 30-minute TTL; expired operations are not silently deleted but are marked `status=expired` in the audit log, so the Operator can see them.

**The audit hash chain** provides tamper-evidence. Every operation appended to the audit log includes a `prev_hash` (the hash of the preceding entry) and a `this_hash` computed as `sha256(prev_hash || canonical_json(payload) || kind || ts)`. Canonical JSON means keys are sorted lexicographically, there is no whitespace, and BigInt values are serialized as strings — deterministic round-trip is required for the hashes to be reproducible.

The CLI's `aiwallet audit verify` command walks every row in the table, recomputes `this_hash` from scratch, and reports any mismatch as a hard error. The chain head hash is also exposed via the MCP `query_audit` tool, so the Agent (or an external system) can record a snapshot and later compare it against the current head to detect any alteration.

The combination of pre-flight checks and a verifiable audit log means that an Operator can not only prevent bad Agent behavior before it happens, but can also reconstruct and verify exactly what happened afterward — which matters both for incident response and for demonstrating due diligence to anyone who later asks.

---

*See [03-architecture.md](03-architecture.md) for a full technical description of each module and how they are connected. See [01-personas-and-scenarios.md](01-personas-and-scenarios.md) for the concrete scenarios these problems appear in.*
