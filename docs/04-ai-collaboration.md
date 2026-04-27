# AI Collaboration Process

This document describes how this project was built using AI-assisted development, what worked well, what required human judgment, and what the honest limitations of the result are. It is written as a transparent account, not a marketing narrative.

---

## Tools Used

**Claude Code** running the **claude-opus-4-7** model with a 1M token context window. Claude Code is Anthropic's CLI-integrated coding assistant; the 1M context window was relevant for this project because the design spec, implementation plan, and code all needed to be in-context simultaneously during later implementation phases.

Three "superpowers" skills were involved:

- **`brainstorming`**: Used in the initial scoping phase to explore the problem space before committing to a design direction. This skill drives a structured dialogue rather than jumping straight to code.
- **`writing-plans`**: Used to convert an approved spec into a detailed, task-by-task implementation plan with explicit commit messages, file paths, and test expectations. The plan is the document that drove the subsequent code phases.
- **`subagent-driven-development`**: Used during code implementation phases. The skill dispatches individual tasks to focused sub-agents, each operating on a slice of the plan, and reports deviations from the plan back to the supervisor for human review.

---

## The Development Process

### Phase 1: Brainstorming (approximately 5 turns)

The project started with a rough brief: build an AI Agent wallet as an interview project, inspired by Cobo's Agentic Wallet work. The initial instinct was to build "an MCP server with some wallet tools" — essentially an API wrapper.

The brainstorming session pushed back on that framing. The question was not "how do we expose wallet functions to an AI Agent?" but "what does a wallet need to be different about to be safe for AI Agent use?" That reframing led to the core threat model: not theft of the key, but influence over an Agent that holds the key. The threat is adversarial prompting, not cryptanalysis.

From there the brainstorm surfaced the three key problems: key isolation (Agent process must not be able to sign alone), bounded delegation (global policy doesn't match how Operators think), and AI-specific runtime failures plus tamper-evident audit. The brainstorm also reviewed Cobo's Agentic Wallet documentation and selectively adopted its Pact concept (constraint half only, not the execution plan half), rejected its Recipes concept as out of scope, and noted its MPC architecture as the production target that this demo is honestly not reaching.

A significant scope debate happened here. The original brief gestured at Tier 3 features: a DEX integration, on-chain EAS identity attestations, multi-chain support, a mobile approval app. The AI pushed back on all of these: none are specific to AI Agent wallets, they would dilute the narrative, and they were a month of engineering work for features that don't strengthen the security story. The human accepted this. The scope stayed tightly focused on key isolation, policy, risk, HITL, audit, Pacts, and a minimal multisig contract.

### Phase 2: Spec Writing

The spec was written collaboratively. The AI drafted sections based on the brainstorm output; the human reviewed, corrected, and approved each section before the AI continued. The final ~900-line design spec went through a self-review pass for: missing placeholder text, internal contradictions (e.g., references to features that were descoped), ambiguous API contracts, and anything that would make the implementation plan ambiguous.

The spec explicitly documented the MPC simulation honestly, the dashboard read-only constraint, and the daemon's security trade-off. These are not footnotes — they are prominent design decisions that the implementation had to respect.

### Phase 3: Implementation Plan

The `writing-plans` skill converted the approved spec into a detailed implementation plan (~5500 lines). The plan has 14 phases, each broken into tasks, each task into numbered steps, each step into a git commit with an exact commit message. The granularity was deliberate: it allows a sub-agent to execute one task with a clear success criterion, without needing to interpret intent.

The plan itself went through a self-review pass: does every task reference the right file paths? Does the test setup happen before the code it tests? Are there any circular dependencies in the build order? Are any spec promises not represented in the plan?

### Phase 4: Implementation (Phases 1–12)

The `subagent-driven-development` skill dispatched code phases to sub-agents. Each sub-agent received the relevant plan section, the spec, and the current codebase state. Sub-agents were instructed to report deviations — cases where the plan and the actual code requirement diverged — rather than silently adapting. This matters because a silent deviation in phase 3 can cause a failure in phase 10 that is very hard to trace.

The human's role during implementation was to review deviation reports and decide whether to update the plan or adjust the code. For example, when the MCP server's tool registration API changed slightly from what the spec implied, the sub-agent flagged it; the human reviewed the actual SDK documentation and approved an update to the implementation approach.

Phase 13 (this set of documents) was implemented directly in the main context, not dispatched to a sub-agent, because the content required continuous access to the full spec and plan simultaneously.

---

## What the AI Was Good At

**Surfacing trade-offs before they became sunk costs.** The most valuable thing the brainstorm did was identify the MPC simulation gap — that a real TSS protocol and a Shamir-split-and-combine are architecturally similar at the policy level but very different at the cryptographic level — before any code was written. The design doc could then be explicit about this from the start rather than discovering it mid-implementation.

**Generating TDD micro-steps.** The implementation plan has unit test steps before feature steps for every module. This is exactly the right way to build something with a complex state machine (the audit hash chain, the Pact lifecycle, the HITL approval flow), and the AI consistently maintained that pattern without needing to be reminded.

**Structuring the Pact concept.** The Cobo Agentic Wallet documentation describes Pacts in terms of both constraints and execution plans. Translating that into a clean TypeScript interface with a well-defined lifecycle (including the lazy expiry pattern, the policy intersection rules, and the audit log interplay) required careful design work. The AI did a good job reasoning through edge cases — what happens if a Pact's budget runs out mid-approval? what if two operations are approved concurrently under the same Pact? — and producing the schema and lifecycle that handles them.

**Pushing back on scope creep.** Every time the conversation drifted toward "and we could also add..." the AI evaluated whether the addition was AI-Agent-specific and whether it fit in the time budget. Usually it didn't. Keeping the scope to the three problems, the five modules, and the Pact abstraction made the final product coherent.

---

## What Required Human Judgment

**Stack and blockchain choices.** TypeScript vs Python, ethers vs viem, Sepolia vs another testnet, Hardhat vs Foundry — the AI offered trade-offs for each but did not have a strong opinion. The human picked TypeScript (existing familiarity, ethers ecosystem), Sepolia (Etherscan verification support), and Hardhat (standard for deploy + verify). These choices are not wrong but they are choices, and they constrained the rest of the implementation.

**Whether to ship a Solidity contract at all.** The spec could have stayed entirely off-chain — policy + risk + audit + Pacts are all off-chain. The multisig contract is an optional path for treasury operations. The human decided to include it because it demonstrates Solidity engineering and shows that the wallet has a "two modes" design. The AI did not push for or against this; it was a human judgment about what the interview deliverable should demonstrate.

**Repo name and framing.** The project is `ai-agent-wallet`, not `cobo-agent-wallet` or `mcp-wallet`. The framing is "an Ethereum wallet purpose-built for AI Agent operation," not "a clone of Cobo's product." These choices matter for how the project is read by reviewers. The human made them.

**How much of Cobo's Agentic Wallet to lean on.** Cobo's public documentation (Pact concept, MPC custody architecture, policy engine, audit) is a genuine reference for this project. The human decided to acknowledge that reference explicitly rather than obscure it, and to be clear about where this project stops (no `executionPlan`, no on-chain Pact attestation, no multi-group MPC) versus where it follows the reference design.

---

## Honest Disclosures

**MPC is a documented simulation.** The wallet's key isolation story is sound: Agent process cannot sign alone. The cryptographic story is not production-grade: the private key is briefly assembled in the CLI process during signing. Real TSS protocols (GG18, CMP) never do this. This is labeled "demo simulation" in the architecture doc, the keystore module README, and the CLI banner. Anyone evaluating this as a production cryptographic system should treat the keystore module as a placeholder.

**The dashboard is read-only by design.** This is not a limitation — it is a security choice. Approval from a web browser increases the attack surface. The CLI is the right surface for signing authority in a demo wallet. A production product would add mobile push-notification approvals; a browser-based approval UI would not be the right direction without much more careful security engineering.

**The daemon trades security for convenience.** When the auto-approve daemon is running, `s_owner` is decrypted in memory for the daemon's lifetime. This is the price of unattended low-value automation. The wallet makes this trade-off explicit (startup banner, audit log entry on every start/stop) and makes it an Owner-initiated opt-in, not the default. Default mode is full HITL.

**Single-host assumption.** Both shares (`s_agent` and `s_owner`) live on the same machine in the demo configuration. The CLI loads `s_agent` from disk at approval time. In a production deployment, `s_owner` would live on a separate device (hardware wallet or separate secure enclave), and the combine step would require a secure channel. The single-host assumption is documented and is sufficient for the demo, but it means the filesystem boundary between the two processes is not as strong as it would be in a real deployment.

---

## Verification Practices

Every core module has unit tests before the feature code (TDD, per the plan). The test suite covers the policy rule matrix, the audit chain tamper-detection, the Pact lifecycle state machine, the keystore split/combine round-trip, and the approval queue TTL behavior.

The spec was reviewed before the plan was written, and the plan was reviewed before implementation started. The plan's self-review pass checked for inconsistencies that would have caused implementation failures rather than discovering them in code review.

Sub-agents were instructed to report deviations, not silently adapt. This discipline matters more than it might seem: in a 12-phase implementation with dependencies, a silent deviation in phase 2 can produce a test failure in phase 8 that has no obvious connection to its cause.

---

## Rough Cost Estimate

Brainstorming and spec writing: approximately 5 turns over ~1 hour, producing a ~900-line spec.

Plan generation: approximately 30 minutes producing a ~5500-line plan.

Implementation (Phases 1–12): multiple sub-agent dispatches over several hours, with deviation reviews by the human between phases.

Documentation (Phase 13, this set of documents): one continuous session in the main context, approximately 45 minutes.

The 1M context window was useful for late phases where the spec, the full plan, the existing code, and the current task all needed to be simultaneously accessible. Without it, the context would have needed to be pruned, and the risk of the AI losing track of earlier decisions would have been higher.

---

*This document describes the process as it actually happened, including the honest limitations. The goal is not to make AI-assisted development look magical, but to show what it is good for and where a human still needs to be in the loop.*
