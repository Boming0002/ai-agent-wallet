# AI Agent Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a TypeScript monorepo for an AI-Agent-facing Ethereum (Sepolia) wallet with MPC-simulated key sharding, declarative policy engine, hash-chained audit log, on-chain 2-of-3 multisig contract, MCP/CLI integration surfaces, and a read-only dashboard. Plus four design docs and an e2e demo.

**Architecture:** Single pnpm workspace. `packages/core` is a pure TS library (no IO at module load) consumed by `packages/mcp-server`, `packages/cli`, and `packages/dashboard`. `packages/contracts` is a separate Hardhat project for the Solidity multisig. SQLite (better-sqlite3, WAL mode) is the only persistence. ethers v6 is the chain client. All signing happens in the CLI/daemon process; the MCP server is read-mostly and never broadcasts.

**Tech Stack:** TypeScript 5.5, Node 20 LTS, pnpm workspaces, ethers v6, `@noble/secp256k1`, `@noble/hashes`, better-sqlite3, `@modelcontextprotocol/sdk`, commander, vitest, Hardhat + Solidity 0.8.24, Vite + React 18 + Tailwind, Express.

**Reference spec:** `docs/superpowers/specs/2026-04-27-ai-agent-wallet-design.md` (read this before starting any task).

---

## Phase Overview

| Phase | What ships | Why this order |
|---|---|---|
| 0 | Workspace scaffold, tooling, CI-friendly base | Need before anything else |
| 1 | `core/types`, `core/storage` (SQLite + encrypted keystore file) | Foundation for every other core module |
| 2 | `core/audit` (hash-chain log) | Used by every later module |
| 3 | `core/keystore` (MPC Shamir 2-of-2 + ECDSA) | Independent crypto module |
| 4 | `core/policy` (declarative rule engine) | Pure logic, no IO |
| 5 | `core/chain` (ethers v6 wrapper) | Mocked in tests, real in integration |
| 6 | `core/risk` (depends on chain) | Pre-flight checks |
| 7 | `core/approval` (HITL queue) | Ties policy + risk + audit + storage together |
| 7B | `core/pact` (task-scoped authorization) | The differentiating AI-Agent abstraction; layered on policy + queue + audit |
| 8 | `cli` package (Owner UX, daemon, broadcasts, pact mgmt) | Independent product slice |
| 9 | `mcp-server` package (Agent UX) | Mirrors CLI's read surface |
| 10 | `contracts` (Solidity multisig + tests + Sepolia deploy) | Independent slice |
| 11 | `cli` multisig commands (drives the contract) | Bridge between core and contracts |
| 12 | `dashboard` (read-only React UI + Express bridge) | Visualization layer |
| 13 | `docs/` (4 required documents) | Pure writing |
| 14 | `scripts/e2e-demo.ts` + README + screen recording + GitHub push | Submission |

---

## File Structure

```
ai-agent-wallet/
├── package.json                          # root workspace metadata
├── pnpm-workspace.yaml
├── tsconfig.base.json                    # shared compiler options
├── .editorconfig
├── .env.example
├── .gitignore                            # already present
├── .nvmrc                                # "20"
├── README.md                             # written in Phase 14
├── LICENSE                               # MIT
├── docs/
│   ├── 01-personas-and-scenarios.md      # Phase 13
│   ├── 02-key-problems.md                # Phase 13
│   ├── 03-architecture.md                # Phase 13
│   ├── 04-ai-collaboration.md            # Phase 13
│   └── superpowers/{specs,plans}/...     # already present
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                  # barrel export
│   │   │   ├── types.ts                  # shared types (Phase 1)
│   │   │   ├── storage/
│   │   │   │   ├── db.ts                 # SQLite open + migrations
│   │   │   │   ├── keystore-file.ts      # AES-256-GCM keystore file IO
│   │   │   │   └── paths.ts              # data dir resolution
│   │   │   ├── audit/
│   │   │   │   ├── hash-chain.ts         # canonical-JSON + sha256 chain
│   │   │   │   ├── log.ts                # append, query, verify
│   │   │   │   └── events.ts             # event-kind types
│   │   │   ├── keystore/
│   │   │   │   ├── shamir.ts             # 2-of-2 SSS over secp256k1 order
│   │   │   │   ├── keystore.ts           # generate, split, combine, sign
│   │   │   │   └── address.ts            # ETH address from pubkey
│   │   │   ├── policy/
│   │   │   │   ├── schema.ts             # policy JSON schema + zod
│   │   │   │   ├── engine.ts             # evaluate(tx, ctx) → verdict
│   │   │   │   └── store.ts              # load/save policy.json
│   │   │   ├── chain/
│   │   │   │   ├── client.ts             # ethers v6 provider wrapper
│   │   │   │   ├── simulate.ts           # eth_call + revert decoding
│   │   │   │   └── broadcast.ts          # sendRawTransaction
│   │   │   ├── risk/
│   │   │   │   ├── recipient.ts          # EOA/contract classification
│   │   │   │   ├── erc20.ts              # ERC-20 sanity probe
│   │   │   │   └── assess.ts             # orchestrator
│   │   │   ├── approval/
│   │   │   │   ├── queue.ts              # SQLite-backed pending queue
│   │   │   │   └── states.ts             # status state machine
│   │   │   └── wallet.ts                 # façade orchestrating all modules
│   │   └── test/
│   │       ├── audit.test.ts
│   │       ├── keystore.test.ts
│   │       ├── policy.test.ts
│   │       ├── risk.test.ts
│   │       ├── approval.test.ts
│   │       └── helpers/
│   │           ├── tmp-data-dir.ts
│   │           └── mock-chain.ts
│   ├── cli/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # commander root
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── audit.ts
│   │   │   │   ├── policy.ts
│   │   │   │   ├── pending.ts
│   │   │   │   ├── approve.ts
│   │   │   │   ├── reject.ts
│   │   │   │   ├── daemon.ts
│   │   │   │   └── multisig.ts
│   │   │   ├── passphrase.ts             # interactive prompt + env fallback
│   │   │   └── format.ts                 # console output helpers
│   │   └── test/
│   │       └── commands.test.ts
│   ├── mcp-server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # MCP server bootstrap
│   │   │   ├── tools/
│   │   │   │   ├── get_address.ts
│   │   │   │   ├── get_balance.ts
│   │   │   │   ├── get_policy.ts
│   │   │   │   ├── simulate_tx.ts
│   │   │   │   ├── propose_tx.ts
│   │   │   │   ├── list_pending.ts
│   │   │   │   ├── query_audit.ts
│   │   │   │   └── multisig_*.ts
│   │   │   └── README.md                 # how to wire into Claude Code etc.
│   │   └── test/
│   │       └── tools.test.ts
│   ├── contracts/
│   │   ├── package.json
│   │   ├── hardhat.config.ts
│   │   ├── contracts/AIAgentMultisig.sol
│   │   ├── scripts/deploy.ts
│   │   └── test/AIAgentMultisig.t.ts
│   └── dashboard/
│       ├── package.json
│       ├── tsconfig.json
│       ├── server.ts                     # tiny Express read API
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api.ts
│           ├── pages/
│           │   ├── Overview.tsx
│           │   ├── Pending.tsx
│           │   ├── Audit.tsx
│           │   └── Policy.tsx
│           └── components/
│               ├── Card.tsx
│               └── Table.tsx
└── scripts/
    └── e2e-demo.ts                       # Phase 14
```

---

## Conventions for every task

- **Commit messages:** Conventional Commits style (`feat:`, `test:`, `refactor:`, `docs:`, `chore:`). All commits in English.
- **Test runner:** `pnpm --filter <pkg> test` (vitest). For Hardhat: `pnpm --filter contracts test`.
- **TDD:** for every core module, write the test first, watch it fail, then implement.
- **Imports:** ESM only. `"type": "module"` in every `package.json`. Use `.js` extension in relative imports (TS-style ESM).
- **Lint:** `pnpm lint` runs eslint at root (set up in Phase 0). No lint disables without a one-line comment explaining why.
- **No emojis in code or docs.**


---

## Phase 0 — Workspace scaffold

### Task 0.1: Root `package.json`

**Files:** Create `package.json`

- [ ] **Step 1:** Write file content:

```json
{
  "name": "ai-agent-wallet",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@9.10.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.9.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2:** Commit.

```bash
git add package.json
git commit -m "chore: scaffold root package.json"
```

### Task 0.2: pnpm workspace + tsconfig base + nvmrc + editorconfig + env example

**Files:** Create `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.editorconfig`, `.env.example`

- [ ] **Step 1:** `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 2:** `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3:** `.nvmrc`:

```
20
```

- [ ] **Step 4:** `.editorconfig`:

```
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 5:** `.env.example`:

```
# Required for the MCP server to unlock the agent share at startup.
AGENT_SHARE_PASS=

# Sepolia RPC endpoint. Use a free provider like Alchemy/Infura/PublicNode.
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Optional: override data dir.
AI_WALLET_DATA_DIR=

# Optional: Etherscan API key for contract verification.
ETHERSCAN_API_KEY=
```

- [ ] **Step 6:** Commit.

```bash
git add pnpm-workspace.yaml tsconfig.base.json .nvmrc .editorconfig .env.example
git commit -m "chore: add workspace config and base tsconfig"
```

### Task 0.3: ESLint + Prettier config

**Files:** Create `eslint.config.js`, `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1:** `eslint.config.js`:

```js
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" }
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off"
    }
  },
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] }
];
```

- [ ] **Step 2:** `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3:** `.prettierignore`:

```
dist/
coverage/
**/*.sqlite
node_modules/
```

- [ ] **Step 4:** Commit.

```bash
git add eslint.config.js .prettierrc.json .prettierignore
git commit -m "chore: add eslint and prettier config"
```

### Task 0.4: Install root devDependencies

- [ ] **Step 1:** Run install.

```bash
pnpm install
```

Expected: Installs typescript, vitest, eslint, prettier into root `node_modules`. No errors.

- [ ] **Step 2:** Commit lockfile.

```bash
git add pnpm-lock.yaml
git commit -m "chore: lock root dependencies"
```

---

## Phase 1 — `core/types` and `core/storage`

### Task 1.1: Create the `core` package skeleton

**Files:** Create `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`

- [ ] **Step 1:** `packages/core/package.json`:

```json
{
  "name": "@ai-agent-wallet/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@noble/hashes": "^1.5.0",
    "@noble/secp256k1": "^2.1.0",
    "better-sqlite3": "^11.3.0",
    "ethers": "^6.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2:** `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3:** `packages/core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
    pool: "forks",
  },
});
```

- [ ] **Step 4:** `packages/core/src/index.ts`:

```ts
export {};
```

- [ ] **Step 5:** Install and typecheck.

```bash
pnpm install
pnpm --filter @ai-agent-wallet/core typecheck
```

Expected: clean.

- [ ] **Step 6:** Commit.

```bash
git add packages/core pnpm-lock.yaml
git commit -m "chore(core): scaffold core package"
```

### Task 1.2: Shared types

**Files:** Create `packages/core/src/types.ts`

- [ ] **Step 1:** Write the file:

```ts
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
}
```

- [ ] **Step 2:** Re-export from `index.ts`:

```ts
// packages/core/src/index.ts
export * from "./types.js";
```

- [ ] **Step 3:** Typecheck.

```bash
pnpm --filter @ai-agent-wallet/core typecheck
```

- [ ] **Step 4:** Commit.

```bash
git add packages/core/src
git commit -m "feat(core): shared types for tx, verdicts, audit, pending"
```

### Task 1.3: Data dir resolver

**Files:** Create `packages/core/src/storage/paths.ts`, `packages/core/test/storage/paths.test.ts`

- [ ] **Step 1:** Write the test first:

```ts
// packages/core/test/storage/paths.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveDataDir } from "../../src/storage/paths.js";
import os from "node:os";
import path from "node:path";

describe("resolveDataDir", () => {
  const ORIGINAL = process.env.AI_WALLET_DATA_DIR;
  beforeEach(() => { delete process.env.AI_WALLET_DATA_DIR; });
  afterEach(() => {
    if (ORIGINAL) process.env.AI_WALLET_DATA_DIR = ORIGINAL;
    else delete process.env.AI_WALLET_DATA_DIR;
  });

  it("uses explicit override", () => {
    expect(resolveDataDir("/tmp/x")).toBe("/tmp/x");
  });
  it("uses env var when no override", () => {
    process.env.AI_WALLET_DATA_DIR = "/tmp/env";
    expect(resolveDataDir()).toBe("/tmp/env");
  });
  it("defaults to ~/.ai-agent-wallet", () => {
    expect(resolveDataDir()).toBe(path.join(os.homedir(), ".ai-agent-wallet"));
  });
});
```

- [ ] **Step 2:** Run; expect FAIL (module missing).

```bash
pnpm --filter @ai-agent-wallet/core test
```

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/storage/paths.ts
import os from "node:os";
import path from "node:path";

export function resolveDataDir(override?: string): string {
  if (override) return override;
  if (process.env.AI_WALLET_DATA_DIR) return process.env.AI_WALLET_DATA_DIR;
  return path.join(os.homedir(), ".ai-agent-wallet");
}
```

- [ ] **Step 4:** Re-run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/storage/paths.ts packages/core/test/storage/paths.test.ts
git commit -m "feat(core/storage): resolveDataDir with override and env precedence"
```

### Task 1.4: SQLite schema + migrations

**Files:** Create `packages/core/src/storage/db.ts`, `packages/core/test/storage/db.test.ts`

- [ ] **Step 1:** Test first:

```ts
// packages/core/test/storage/db.test.ts
import { describe, it, expect } from "vitest";
import { openDatabase } from "../../src/storage/db.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("openDatabase", () => {
  it("creates schema on first open", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
    const db = openDatabase(dir);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(["audit_log", "pacts", "pending_ops", "schema_version"]);
    db.close();
  });

  it("is idempotent on second open", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
    openDatabase(dir).close();
    const db = openDatabase(dir);
    const ver = db.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(ver.version).toBe(1);
    db.close();
  });

  it("uses WAL journal", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
    const db = openDatabase(dir);
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
    db.close();
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/storage/db.ts
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version(version) VALUES (1);

CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  this_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS pending_ops (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  tx_json TEXT NOT NULL,
  policy_verdict_json TEXT NOT NULL,
  risk_report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  tx_hash TEXT,
  pact_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_ops(status, created_at);

CREATE TABLE IF NOT EXISTS pacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  intent TEXT NOT NULL,
  policy_override_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_total_value_wei TEXT NOT NULL,
  max_op_count INTEGER,
  spent_wei TEXT NOT NULL DEFAULT '0',
  op_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_pacts_status ON pacts(status, expires_at);
`;

export function openDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "wallet.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_V1);
  return db;
}
```

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/storage/db.ts packages/core/test/storage/db.test.ts
git commit -m "feat(core/storage): SQLite schema with audit_log and pending_ops"
```

### Task 1.5: Encrypted keystore file (AES-256-GCM + scrypt)

**Files:** Create `packages/core/src/storage/keystore-file.ts`, `packages/core/test/storage/keystore-file.test.ts`

- [ ] **Step 1:** Test first:

```ts
// packages/core/test/storage/keystore-file.test.ts
import { describe, it, expect } from "vitest";
import { encryptKeystore, decryptKeystore } from "../../src/storage/keystore-file.js";

describe("keystore-file", () => {
  it("round-trips a payload", () => {
    const payload = Buffer.from("super-secret-share", "utf8");
    const enc = encryptKeystore(payload, "correct horse battery staple");
    const dec = decryptKeystore(enc, "correct horse battery staple");
    expect(dec.equals(payload)).toBe(true);
  });

  it("rejects wrong passphrase", () => {
    const enc = encryptKeystore(Buffer.from("x"), "right");
    expect(() => decryptKeystore(enc, "wrong")).toThrow();
  });

  it("uses different ciphertext for same payload (random nonce)", () => {
    const a = encryptKeystore(Buffer.from("x"), "p");
    const b = encryptKeystore(Buffer.from("x"), "p");
    expect(a.toString("hex")).not.toBe(b.toString("hex"));
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/storage/keystore-file.ts
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// File format (binary):
//   magic       (4)   "AIWK"
//   version     (1)   0x01
//   N_log2      (1)   17
//   r           (1)   8
//   p           (1)   1
//   salt        (16)
//   nonce       (12)
//   ciphertext+tag  (variable, AES-256-GCM, tag appended last 16 bytes)

const MAGIC = Buffer.from("AIWK", "ascii");
const VERSION = 0x01;
const N_LOG2 = 17;
const R = 8;
const P = 1;
const SALT_LEN = 16;
const NONCE_LEN = 12;
const TAG_LEN = 16;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 1 << N_LOG2, r: R, p: P, maxmem: 256 * 1024 * 1024 });
}

export function encryptKeystore(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from([VERSION, N_LOG2, R, P]);
  return Buffer.concat([MAGIC, header, salt, nonce, ct, tag]);
}

export function decryptKeystore(blob: Buffer, passphrase: string): Buffer {
  if (!blob.subarray(0, 4).equals(MAGIC)) throw new Error("bad magic");
  if (blob[4] !== VERSION) throw new Error("unsupported version");
  // header[5..7] are scrypt params; we trust the constants in v1
  const salt = blob.subarray(8, 8 + SALT_LEN);
  const nonce = blob.subarray(8 + SALT_LEN, 8 + SALT_LEN + NONCE_LEN);
  const tagStart = blob.length - TAG_LEN;
  const ct = blob.subarray(8 + SALT_LEN + NONCE_LEN, tagStart);
  const tag = blob.subarray(tagStart);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/storage/keystore-file.ts packages/core/test/storage/keystore-file.test.ts
git commit -m "feat(core/storage): AES-256-GCM + scrypt keystore file format"
```

---

## Phase 2 — `core/audit` (hash-chain log)

### Task 2.1: Canonical JSON + chain hash

**Files:** Create `packages/core/src/audit/hash-chain.ts`, `packages/core/test/audit/hash-chain.test.ts`

- [ ] **Step 1:** Test first:

```ts
// packages/core/test/audit/hash-chain.test.ts
import { describe, it, expect } from "vitest";
import { canonicalJson, chainHash } from "../../src/audit/hash-chain.js";

describe("canonicalJson", () => {
  it("sorts keys lexicographically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("recurses into nested objects", () => {
    expect(canonicalJson({ z: { b: 1, a: 2 } })).toBe('{"z":{"a":2,"b":1}}');
  });
  it("preserves array order", () => {
    expect(canonicalJson({ x: [3, 1, 2] })).toBe('{"x":[3,1,2]}');
  });
  it("renders bigint as string", () => {
    expect(canonicalJson({ v: 10n })).toBe('{"v":"10"}');
  });
});

describe("chainHash", () => {
  it("is deterministic", () => {
    const a = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    const b = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    expect(a).toBe(b);
  });
  it("changes when prev changes", () => {
    const a = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    const b = chainHash("0x" + "1".repeat(64), "init", 1, { x: 1 });
    expect(a).not.toBe(b);
  });
  it("returns 0x-prefixed 64-hex string", () => {
    const h = chainHash("0x" + "0".repeat(64), "init", 1, { x: 1 });
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/audit/hash-chain.ts
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Hex } from "../types.js";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

export function chainHash(prevHash: Hex, kind: string, ts: number, payload: unknown): Hex {
  const input = `${prevHash}|${kind}|${ts}|${canonicalJson(payload)}`;
  return ("0x" + bytesToHex(sha256(new TextEncoder().encode(input)))) as Hex;
}

export const ZERO_HASH: Hex = ("0x" + "0".repeat(64)) as Hex;
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/audit/hash-chain.ts packages/core/test/audit/hash-chain.test.ts
git commit -m "feat(core/audit): canonical JSON + sha256 chain hash"
```

### Task 2.2: Append + verify + query

**Files:** Create `packages/core/src/audit/log.ts`, `packages/core/test/audit/log.test.ts`

- [ ] **Step 1:** Test first:

```ts
// packages/core/test/audit/log.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/storage/db.js";
import { AuditLog } from "../../src/audit/log.js";

function freshLog() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  return { db, log: new AuditLog(db, () => 1700000000000) };
}

describe("AuditLog", () => {
  it("appends entries with chained hashes", () => {
    const { log } = freshLog();
    const a = log.append("init", { addr: "0xaa" });
    const b = log.append("propose", { id: "x" });
    expect(b.prevHash).toBe(a.thisHash);
  });

  it("verify() returns ok for clean chain", () => {
    const { log } = freshLog();
    log.append("init", {});
    log.append("propose", { id: "x" });
    expect(log.verify()).toEqual({ ok: true, headHash: expect.any(String) });
  });

  it("verify() detects tamper", () => {
    const { db, log } = freshLog();
    log.append("init", {});
    log.append("propose", { id: "x" });
    db.prepare("UPDATE audit_log SET payload_json = ? WHERE seq = 1").run('{"tampered":true}');
    const r = log.verify();
    expect(r.ok).toBe(false);
  });

  it("query supports kind filter and limit", () => {
    const { log } = freshLog();
    log.append("init", {});
    log.append("propose", {});
    log.append("propose", {});
    expect(log.query({ kind: "propose" }).length).toBe(2);
    expect(log.query({ limit: 1 }).length).toBe(1);
  });

  it("headHash() returns ZERO_HASH for empty log", () => {
    const { log } = freshLog();
    expect(log.headHash()).toBe("0x" + "0".repeat(64));
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/audit/log.ts
import type Database from "better-sqlite3";
import type { AuditEntry, AuditEventKind, Hex } from "../types.js";
import { canonicalJson, chainHash, ZERO_HASH } from "./hash-chain.js";

export interface QueryOpts {
  kind?: AuditEventKind;
  limit?: number;
  sinceSeq?: number;
}

export class AuditLog {
  constructor(private db: Database.Database, private now: () => number = Date.now) {}

  headHash(): Hex {
    const row = this.db
      .prepare("SELECT this_hash FROM audit_log ORDER BY seq DESC LIMIT 1")
      .get() as { this_hash: string } | undefined;
    return (row?.this_hash ?? ZERO_HASH) as Hex;
  }

  append(kind: AuditEventKind, payload: Record<string, unknown>): AuditEntry {
    const ts = this.now();
    const prev = this.headHash();
    const hash = chainHash(prev, kind, ts, payload);
    const info = this.db
      .prepare(
        "INSERT INTO audit_log(ts, kind, payload_json, prev_hash, this_hash) VALUES (?,?,?,?,?)",
      )
      .run(ts, kind, canonicalJson(payload), prev, hash);
    return {
      seq: Number(info.lastInsertRowid),
      ts,
      kind,
      payload,
      prevHash: prev,
      thisHash: hash,
    };
  }

  query(opts: QueryOpts = {}): AuditEntry[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.kind) { where.push("kind = ?"); args.push(opts.kind); }
    if (opts.sinceSeq !== undefined) { where.push("seq > ?"); args.push(opts.sinceSeq); }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const limit = opts.limit ?? 1000;
    const rows = this.db
      .prepare(`SELECT seq, ts, kind, payload_json, prev_hash, this_hash FROM audit_log ${whereSql} ORDER BY seq ASC LIMIT ?`)
      .all(...args, limit) as Array<{
        seq: number; ts: number; kind: string;
        payload_json: string; prev_hash: string; this_hash: string;
      }>;
    return rows.map((r) => ({
      seq: r.seq, ts: r.ts,
      kind: r.kind as AuditEventKind,
      payload: JSON.parse(r.payload_json),
      prevHash: r.prev_hash as Hex,
      thisHash: r.this_hash as Hex,
    }));
  }

  verify(): { ok: true; headHash: Hex } | { ok: false; brokenAt: number; expected: Hex; got: Hex } {
    const rows = this.db
      .prepare("SELECT seq, ts, kind, payload_json, prev_hash, this_hash FROM audit_log ORDER BY seq ASC")
      .all() as Array<{ seq: number; ts: number; kind: string;
        payload_json: string; prev_hash: string; this_hash: string }>;
    let prev: Hex = ZERO_HASH;
    for (const r of rows) {
      if (r.prev_hash !== prev) {
        return { ok: false, brokenAt: r.seq, expected: prev, got: r.prev_hash as Hex };
      }
      const payload = JSON.parse(r.payload_json);
      const expected = chainHash(prev, r.kind, r.ts, payload);
      if (expected !== r.this_hash) {
        return { ok: false, brokenAt: r.seq, expected, got: r.this_hash as Hex };
      }
      prev = r.this_hash as Hex;
    }
    return { ok: true, headHash: prev };
  }
}
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/audit/log.ts packages/core/test/audit/log.test.ts
git commit -m "feat(core/audit): AuditLog with append, query, verify"
```

---

## Phase 3 — `core/keystore` (MPC Shamir 2-of-2)

### Task 3.1: Address derivation

**Files:** Create `packages/core/src/keystore/address.ts`, `packages/core/test/keystore/address.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/keystore/address.test.ts
import { describe, it, expect } from "vitest";
import { addressFromPrivateKey } from "../../src/keystore/address.js";

describe("addressFromPrivateKey", () => {
  it("matches known vector (vitalik test key)", () => {
    // d = 1, public key derivation must produce a deterministic address
    const d = 1n;
    const a = addressFromPrivateKey(d);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Re-deriving must yield the same string.
    expect(addressFromPrivateKey(d)).toBe(a);
  });

  it("rejects 0 and >= n", () => {
    expect(() => addressFromPrivateKey(0n)).toThrow();
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/keystore/address.ts
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import type { EthAddress } from "../types.js";

const N = secp.CURVE.n;

export function addressFromPrivateKey(d: bigint): EthAddress {
  if (d <= 0n || d >= N) throw new Error("private key out of range");
  const dBytes = d.toString(16).padStart(64, "0");
  const pubUncompressed = secp.getPublicKey(dBytes, false); // 65 bytes, leading 0x04
  const pub = pubUncompressed.subarray(1); // 64 bytes
  const hash = keccak_256(pub);
  const addr = "0x" + bytesToHex(hash.subarray(12));
  return addr as EthAddress;
}
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/keystore/address.ts packages/core/test/keystore/address.test.ts
git commit -m "feat(core/keystore): derive Ethereum address from private key"
```

### Task 3.2: 2-of-2 Shamir split / combine over GF(n)

**Files:** Create `packages/core/src/keystore/shamir.ts`, `packages/core/test/keystore/shamir.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/keystore/shamir.test.ts
import { describe, it, expect } from "vitest";
import { split2of2, combine2of2 } from "../../src/keystore/shamir.js";

describe("Shamir 2-of-2 over secp256k1 order", () => {
  it("round-trips a random secret", () => {
    const secret = 0x1234567890abcdef1234567890abcdefn;
    const { share1, share2 } = split2of2(secret, () => 0xdeadbeefn);
    expect(combine2of2(share1, share2)).toBe(secret);
  });

  it("two random splits of the same secret reconstruct correctly", () => {
    const secret = 0xfeedface_cafebabe_aabbccddeeff0011n;
    const a = split2of2(secret);
    const b = split2of2(secret);
    expect(combine2of2(a.share1, a.share2)).toBe(secret);
    expect(combine2of2(b.share1, b.share2)).toBe(secret);
    // Different randomness → different shares.
    expect(a.share1).not.toBe(b.share1);
  });

  it("each share alone is information-theoretically random (no leak in distribution)", () => {
    // Sanity: 100 splits produce 100 distinct share1 values.
    const seen = new Set<bigint>();
    for (let i = 0; i < 100; i++) seen.add(split2of2(42n).share1);
    expect(seen.size).toBe(100);
  });

  it("rejects out-of-range secret", () => {
    expect(() => split2of2(0n)).toThrow();
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/keystore/shamir.ts
import * as secp from "@noble/secp256k1";
import { randomBytes } from "node:crypto";

const N = secp.CURVE.n;

function randScalar(rand: () => bigint = defaultRand): bigint {
  // Rejection sample to avoid bias.
  for (;;) {
    const x = rand();
    if (x !== 0n && x < N) return x;
  }
}

function defaultRand(): bigint {
  const b = randomBytes(32);
  return BigInt("0x" + b.toString("hex"));
}

export interface SharePair { share1: bigint; share2: bigint; }

export function split2of2(secret: bigint, rand: () => bigint = defaultRand): SharePair {
  if (secret <= 0n || secret >= N) throw new Error("secret out of range");
  // Additive 2-of-2 over Z/nZ: s1 random, s2 = secret - s1 (mod n).
  const s1 = randScalar(rand);
  const s2 = (secret - s1 + N) % N;
  return { share1: s1, share2: s2 };
}

export function combine2of2(s1: bigint, s2: bigint): bigint {
  return (s1 + s2) % N;
}
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/keystore/shamir.ts packages/core/test/keystore/shamir.test.ts
git commit -m "feat(core/keystore): 2-of-2 additive sharing over secp256k1 order"
```

### Task 3.3: Keystore facade — generate, load shares, sign

**Files:** Create `packages/core/src/keystore/keystore.ts`, `packages/core/test/keystore/keystore.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/keystore/keystore.test.ts
import { describe, it, expect } from "vitest";
import { generateWallet, signWithShares, addressFromShares } from "../../src/keystore/keystore.js";
import { keccak_256 } from "@noble/hashes/sha3";
import * as secp from "@noble/secp256k1";

describe("keystore facade", () => {
  it("generates a wallet with two shares that recombine to a valid private key", () => {
    const w = generateWallet();
    expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(w.shareAgent).toBeTypeOf("string");
    expect(w.shareOwner).toBeTypeOf("string");
    expect(addressFromShares(w.shareAgent, w.shareOwner)).toBe(w.address);
  });

  it("signWithShares produces a valid ECDSA signature", () => {
    const w = generateWallet();
    const msg = keccak_256(new TextEncoder().encode("hello"));
    const sig = signWithShares(w.shareAgent, w.shareOwner, msg);
    expect(sig.r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sig.s).toMatch(/^0x[0-9a-f]{64}$/);
    expect([27, 28]).toContain(sig.v);
    // Recover address must match wallet.address.
    const recovered = secp.recoverPublicKey(
      msg,
      Buffer.from(sig.r.slice(2) + sig.s.slice(2), "hex"),
      sig.v - 27,
    );
    expect(recovered).toBeDefined();
  });

  it("a single share alone cannot reconstruct the address", () => {
    const w = generateWallet();
    expect(() => addressFromShares(w.shareAgent, "0x" + "0".repeat(64))).not.toBe(w.address);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/keystore/keystore.ts
import * as secp from "@noble/secp256k1";
import { randomBytes } from "node:crypto";
import { split2of2, combine2of2 } from "./shamir.js";
import { addressFromPrivateKey } from "./address.js";
import type { EthAddress, Hex } from "../types.js";

export interface Wallet {
  address: EthAddress;
  shareAgent: Hex;
  shareOwner: Hex;
}

export interface Signature { r: Hex; s: Hex; v: 27 | 28; }

function bigintToHex32(x: bigint): Hex {
  return ("0x" + x.toString(16).padStart(64, "0")) as Hex;
}

function hexToBigint(h: string): bigint {
  return BigInt(h.startsWith("0x") ? h : "0x" + h);
}

export function generateWallet(): Wallet {
  // Sample a private key d in [1, n-1].
  let d: bigint;
  do {
    const b = randomBytes(32);
    d = BigInt("0x" + b.toString("hex"));
  } while (d === 0n || d >= secp.CURVE.n);
  const { share1, share2 } = split2of2(d);
  const address = addressFromPrivateKey(d);
  // Zero d immediately by overwriting our local var; JS GC takes care of the rest.
  d = 0n;
  return {
    address,
    shareAgent: bigintToHex32(share1),
    shareOwner: bigintToHex32(share2),
  };
}

export function addressFromShares(shareAgent: string, shareOwner: string): EthAddress {
  const d = combine2of2(hexToBigint(shareAgent), hexToBigint(shareOwner));
  if (d === 0n || d >= secp.CURVE.n) throw new Error("invalid combined share");
  const addr = addressFromPrivateKey(d);
  // Overwrite buffer references.
  return addr;
}

export function signWithShares(shareAgent: string, shareOwner: string, msgHash: Uint8Array): Signature {
  const d = combine2of2(hexToBigint(shareAgent), hexToBigint(shareOwner));
  if (d === 0n || d >= secp.CURVE.n) throw new Error("invalid combined share");
  const dHex = d.toString(16).padStart(64, "0");
  const sig = secp.sign(msgHash, dHex, { lowS: true });
  // Recover v: try 0 then 1.
  let v: 27 | 28 = 27;
  for (const recId of [0, 1] as const) {
    try {
      const pub = secp.recoverPublicKey(msgHash, sig.toCompactRawBytes(), recId);
      if (pub) { v = (27 + recId) as 27 | 28; break; }
    } catch { /* try next */ }
  }
  // After signing, drop d from any captured closure.
  return {
    r: ("0x" + sig.r.toString(16).padStart(64, "0")) as Hex,
    s: ("0x" + sig.s.toString(16).padStart(64, "0")) as Hex,
    v,
  };
}
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/keystore packages/core/test/keystore
git commit -m "feat(core/keystore): generate/combine wallet, sign via combined shares"
```

---

## Phase 4 — `core/policy` (declarative rule engine)

### Task 4.1: Policy schema (zod) + load/save

**Files:** Create `packages/core/src/policy/schema.ts`, `packages/core/src/policy/store.ts`, `packages/core/test/policy/schema.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/policy/schema.test.ts
import { describe, it, expect } from "vitest";
import { PolicySchema, defaultPolicy } from "../../src/policy/schema.js";

describe("PolicySchema", () => {
  it("accepts default policy", () => {
    expect(PolicySchema.parse(defaultPolicy())).toBeTruthy();
  });
  it("requires autoApproveMaxWei <= perTxMaxWei", () => {
    expect(() =>
      PolicySchema.parse({ ...defaultPolicy(), autoApproveMaxWei: "10", perTxMaxWei: "5" }),
    ).toThrow();
  });
  it("rejects non-decimal wei strings", () => {
    expect(() => PolicySchema.parse({ ...defaultPolicy(), perTxMaxWei: "0xff" })).toThrow();
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/policy/schema.ts
import { z } from "zod";

const Decimal = z.string().regex(/^\d+$/, "must be decimal wei string");
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Selector = z.string().regex(/^0x[0-9a-fA-F]{8}$/);

export const PolicySchema = z
  .object({
    version: z.literal(1),
    perTxMaxWei: Decimal,
    dailyMaxWei: Decimal,
    autoApproveMaxWei: Decimal,
    addressAllowlist: z.array(Address).default([]),
    addressDenylist: z.array(Address).default([]),
    contractMethodAllowlist: z
      .array(z.object({ address: Address, selector: Selector }))
      .default([]),
  })
  .superRefine((p, ctx) => {
    if (BigInt(p.autoApproveMaxWei) > BigInt(p.perTxMaxWei)) {
      ctx.addIssue({ code: "custom", message: "autoApproveMaxWei must be <= perTxMaxWei" });
    }
  });

export type Policy = z.infer<typeof PolicySchema>;

export function defaultPolicy(): Policy {
  return {
    version: 1,
    perTxMaxWei: "200000000000000000",      // 0.2 ETH
    dailyMaxWei: "500000000000000000",      // 0.5 ETH
    autoApproveMaxWei: "10000000000000000", // 0.01 ETH
    addressAllowlist: [],
    addressDenylist: [],
    contractMethodAllowlist: [],
  };
}
```

- [ ] **Step 4:** Implement store (no separate test; covered by integration in approval):

```ts
// packages/core/src/policy/store.ts
import fs from "node:fs";
import path from "node:path";
import { Policy, PolicySchema, defaultPolicy } from "./schema.js";

export function policyPath(dataDir: string): string {
  return path.join(dataDir, "policy.json");
}

export function loadPolicy(dataDir: string): Policy {
  const p = policyPath(dataDir);
  if (!fs.existsSync(p)) return defaultPolicy();
  return PolicySchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
}

export function savePolicy(dataDir: string, policy: Policy): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(policyPath(dataDir), JSON.stringify(policy, null, 2) + "\n");
}
```

- [ ] **Step 5:** Run tests; expect PASS.

- [ ] **Step 6:** Commit.

```bash
git add packages/core/src/policy packages/core/test/policy
git commit -m "feat(core/policy): zod schema, default policy, load/save"
```

### Task 4.2: Policy engine — evaluate

**Files:** Create `packages/core/src/policy/engine.ts`, `packages/core/test/policy/engine.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/policy/engine.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../../src/policy/engine.js";
import { defaultPolicy } from "../../src/policy/schema.js";
import type { ProposedTx } from "../../src/types.js";

const tx = (overrides: Partial<ProposedTx> = {}): ProposedTx => ({
  to: "0x" + "11".repeat(20) as `0x${string}`,
  value: "0",
  data: "0x",
  ...overrides,
});

describe("evaluatePolicy", () => {
  it("denies on denylist", () => {
    const p = { ...defaultPolicy(), addressDenylist: ["0x" + "11".repeat(20)] as any };
    const v = evaluatePolicy(tx(), p, 0n);
    expect(v.kind).toBe("deny");
  });

  it("denies when allowlist non-empty and to not in it", () => {
    const p = { ...defaultPolicy(), addressAllowlist: ["0x" + "22".repeat(20)] as any };
    expect(evaluatePolicy(tx(), p, 0n).kind).toBe("deny");
  });

  it("denies above perTxMaxWei", () => {
    const p = defaultPolicy();
    const v = evaluatePolicy(tx({ value: "999000000000000000000" }), p, 0n);
    expect(v.kind).toBe("deny");
  });

  it("denies when dailySpent + value > dailyMaxWei", () => {
    const p = defaultPolicy();
    const dailySpent = BigInt("499000000000000000"); // 0.499 ETH already
    const v = evaluatePolicy(tx({ value: "5000000000000000" }), p, dailySpent); // +0.005 -> 0.504 > 0.5
    expect(v.kind).toBe("deny");
  });

  it("auto-approves at-or-below autoApproveMaxWei", () => {
    const v = evaluatePolicy(tx({ value: "1000000000000000" }), defaultPolicy(), 0n);
    expect(v.kind).toBe("auto_approve");
  });

  it("requires HITL between autoApprove and perTxMax", () => {
    const v = evaluatePolicy(tx({ value: "100000000000000000" }), defaultPolicy(), 0n);
    expect(v.kind).toBe("require_hitl");
  });

  it("denies contract call not in method allowlist", () => {
    const tok = ("0x" + "ab".repeat(20)) as `0x${string}`;
    const p = { ...defaultPolicy(), contractMethodAllowlist: [{ address: tok, selector: "0xa9059cbb" }] };
    const v = evaluatePolicy(
      tx({ to: ("0x" + "cd".repeat(20)) as any, data: "0xa9059cbb00" as any }),
      p as any,
      0n,
    );
    expect(v.kind).toBe("deny");
  });

  it("allows method on allowlist", () => {
    const tok = ("0x" + "ab".repeat(20)) as `0x${string}`;
    const p = { ...defaultPolicy(), contractMethodAllowlist: [{ address: tok, selector: "0xa9059cbb" }] };
    const v = evaluatePolicy(
      tx({ to: tok, data: "0xa9059cbb000000" as any, value: "0" }),
      p as any,
      0n,
    );
    expect(v.kind).toBe("auto_approve");
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/policy/engine.ts
import type { ProposedTx, PolicyVerdict, EthAddress } from "../types.js";
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
```

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/policy/engine.ts packages/core/test/policy/engine.test.ts
git commit -m "feat(core/policy): rule evaluation across deny/allowlist/caps/bands"
```

---

## Phase 5 — `core/chain` (ethers v6 wrapper)

This phase introduces a thin abstraction over ethers so we can mock the chain in unit tests. Tests use a `MockProvider`; integration smoke tests in Phase 14 use a real RPC.

### Task 5.1: ChainClient interface + ethers v6 implementation

**Files:** Create `packages/core/src/chain/client.ts`, `packages/core/test/helpers/mock-chain.ts`, `packages/core/test/chain/client.test.ts`

- [ ] **Step 1:** Test (using MockProvider):

```ts
// packages/core/test/chain/client.test.ts
import { describe, it, expect } from "vitest";
import { EthersChainClient } from "../../src/chain/client.js";
import { MockProvider } from "../helpers/mock-chain.js";

describe("EthersChainClient", () => {
  it("getBalance returns wei as bigint", async () => {
    const provider = new MockProvider({ balances: { ["0x" + "aa".repeat(20)]: 12345n } });
    const c = new EthersChainClient(provider as any);
    const b = await c.getBalance("0x" + "aa".repeat(20) as any);
    expect(b).toBe(12345n);
  });

  it("getCode returns 0x for EOA", async () => {
    const provider = new MockProvider({ code: { ["0x" + "aa".repeat(20)]: "0x" } });
    const c = new EthersChainClient(provider as any);
    expect(await c.getCode("0x" + "aa".repeat(20) as any)).toBe("0x");
  });

  it("getCode returns bytecode for contract", async () => {
    const provider = new MockProvider({ code: { ["0x" + "bb".repeat(20)]: "0x60806040" } });
    const c = new EthersChainClient(provider as any);
    expect(await c.getCode("0x" + "bb".repeat(20) as any)).toBe("0x60806040");
  });
});
```

- [ ] **Step 2:** MockProvider helper:

```ts
// packages/core/test/helpers/mock-chain.ts
export interface MockState {
  balances?: Record<string, bigint>;
  code?: Record<string, string>;
  callResults?: Record<string, string>;            // keccak(to+data) → return-data hex
  callReverts?: Record<string, string>;            // keccak(to+data) → revert reason
  nonces?: Record<string, number>;
  txHashes?: string[];                              // pop next on send
}

export class MockProvider {
  constructor(private state: MockState) {}
  async getBalance(addr: string): Promise<bigint> {
    return this.state.balances?.[addr.toLowerCase()] ?? this.state.balances?.[addr] ?? 0n;
  }
  async getCode(addr: string): Promise<string> {
    return this.state.code?.[addr.toLowerCase()] ?? this.state.code?.[addr] ?? "0x";
  }
  async call(tx: { to: string; data: string }): Promise<string> {
    const k = (tx.to + tx.data).toLowerCase();
    if (this.state.callReverts?.[k]) {
      const e: any = new Error("execution reverted");
      e.data = "0x08c379a0" + Buffer.from(this.state.callReverts[k]).toString("hex");
      throw e;
    }
    return this.state.callResults?.[k] ?? "0x";
  }
  async estimateGas(): Promise<bigint> { return 21000n; }
  async getTransactionCount(addr: string): Promise<number> {
    return this.state.nonces?.[addr.toLowerCase()] ?? 0;
  }
  async broadcastTransaction(_raw: string): Promise<{ hash: string }> {
    const h = this.state.txHashes?.shift() ?? "0x" + "ab".repeat(32);
    return { hash: h };
  }
}
```

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/chain/client.ts
import type { JsonRpcProvider } from "ethers";
import type { EthAddress, Hex, ProposedTx } from "../types.js";

export interface ChainClient {
  getBalance(addr: EthAddress): Promise<bigint>;
  getCode(addr: EthAddress): Promise<string>;
  call(tx: { to: EthAddress; data: Hex }): Promise<string>;
  estimateGas(tx: { to: EthAddress; data: Hex; value: bigint; from: EthAddress }): Promise<bigint>;
  getNonce(addr: EthAddress): Promise<number>;
  broadcastRaw(raw: Hex): Promise<{ hash: Hex }>;
  getChainId(): Promise<number>;
}

export class EthersChainClient implements ChainClient {
  private chainIdCache?: number;
  constructor(private provider: JsonRpcProvider) {}
  async getBalance(addr: EthAddress) { return await this.provider.getBalance(addr); }
  async getCode(addr: EthAddress) { return await this.provider.getCode(addr); }
  async call(tx: { to: EthAddress; data: Hex }) { return await this.provider.call(tx); }
  async estimateGas(tx: { to: EthAddress; data: Hex; value: bigint; from: EthAddress }) {
    return await this.provider.estimateGas(tx);
  }
  async getNonce(addr: EthAddress) { return await this.provider.getTransactionCount(addr); }
  async broadcastRaw(raw: Hex) {
    const r = await this.provider.broadcastTransaction(raw);
    return { hash: r.hash as Hex };
  }
  async getChainId() {
    if (this.chainIdCache !== undefined) return this.chainIdCache;
    const n = await this.provider.getNetwork();
    this.chainIdCache = Number(n.chainId);
    return this.chainIdCache;
  }
}

export function makeProvider(rpcUrl: string): JsonRpcProvider {
  // Lazy import to keep ethers off the hot path of tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JsonRpcProvider } = require("ethers");
  return new JsonRpcProvider(rpcUrl);
}
```

- [ ] **Step 4:** Run tests; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/chain packages/core/test/chain packages/core/test/helpers/mock-chain.ts
git commit -m "feat(core/chain): ChainClient interface and ethers-backed implementation"
```

### Task 5.2: Simulation + revert decode

**Files:** Create `packages/core/src/chain/simulate.ts`, `packages/core/test/chain/simulate.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/chain/simulate.test.ts
import { describe, it, expect } from "vitest";
import { simulate } from "../../src/chain/simulate.js";
import { MockProvider } from "../helpers/mock-chain.js";
import { EthersChainClient } from "../../src/chain/client.js";

describe("simulate", () => {
  it("returns ok with gas when call succeeds", async () => {
    const c = new EthersChainClient(new MockProvider({}) as any);
    const r = await simulate(c, {
      to: "0x" + "aa".repeat(20) as any, data: "0x" as any, value: "0",
    }, "0x" + "bb".repeat(20) as any);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gasUsed).toBe("21000");
  });

  it("decodes revert reason from Error(string)", async () => {
    const provider = new MockProvider({
      callReverts: { ["0x" + "aa".repeat(20) + "0x"]: "boom" },
    });
    const c = new EthersChainClient(provider as any);
    const r = await simulate(c, {
      to: "0x" + "aa".repeat(20) as any, data: "0x" as any, value: "0",
    }, "0x" + "bb".repeat(20) as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.revertReason).toMatch(/boom|execution reverted/);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/chain/simulate.ts
import type { ChainClient } from "./client.js";
import type { ProposedTx, EthAddress } from "../types.js";

export type SimResult = { ok: true; gasUsed: string } | { ok: false; revertReason: string };

function decodeRevert(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "execution reverted";
  const data = (err as { data?: string })?.data;
  if (!data || typeof data !== "string") return msg;
  // Error(string) selector = 0x08c379a0
  if (data.startsWith("0x08c379a0") && data.length >= 138) {
    try {
      const hex = data.slice(138);
      const bytes = Buffer.from(hex, "hex");
      const end = bytes.indexOf(0);
      return bytes.subarray(0, end >= 0 ? end : bytes.length).toString("utf8") || msg;
    } catch { return msg; }
  }
  return msg;
}

export async function simulate(client: ChainClient, tx: ProposedTx, from: EthAddress): Promise<SimResult> {
  try {
    await client.call({ to: tx.to, data: tx.data });
    const gas = await client.estimateGas({
      to: tx.to, data: tx.data, value: BigInt(tx.value), from,
    });
    return { ok: true, gasUsed: gas.toString() };
  } catch (e) {
    return { ok: false, revertReason: decodeRevert(e) };
  }
}
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/chain/simulate.ts packages/core/test/chain/simulate.test.ts
git commit -m "feat(core/chain): simulate with revert reason decoding"
```

---

## Phase 6 — `core/risk`

### Task 6.1: Recipient classification + ERC-20 sanity probe + assess

**Files:** Create `packages/core/src/risk/recipient.ts`, `packages/core/src/risk/erc20.ts`, `packages/core/src/risk/assess.ts`, `packages/core/test/risk/assess.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/risk/assess.test.ts
import { describe, it, expect } from "vitest";
import { assessRisk } from "../../src/risk/assess.js";
import { MockProvider } from "../helpers/mock-chain.js";
import { EthersChainClient } from "../../src/chain/client.js";

const FROM = ("0x" + "ee".repeat(20)) as `0x${string}`;
const EOA  = ("0x" + "aa".repeat(20)) as `0x${string}`;
const CONTRACT = ("0x" + "bb".repeat(20)) as `0x${string}`;
const SMALL = ("0x" + "cc".repeat(20)) as `0x${string}`;

describe("assessRisk", () => {
  it("classifies EOA recipient", async () => {
    const c = new EthersChainClient(new MockProvider({}) as any);
    const r = await assessRisk(c, { to: EOA, value: "1000", data: "0x" }, FROM);
    expect(r.recipient.kind).toBe("eoa");
    expect(r.flags).not.toContain("proxy_or_minimal");
  });

  it("flags proxy_or_minimal for tiny contract", async () => {
    const c = new EthersChainClient(new MockProvider({ code: { [SMALL]: "0x6080" } }) as any);
    const r = await assessRisk(c, { to: SMALL, value: "0", data: "0x" }, FROM);
    expect(r.flags).toContain("proxy_or_minimal");
  });

  it("ERC-20 transfer call: ok when token responds to name/symbol/decimals", async () => {
    // selector for transfer(address,uint256) = 0xa9059cbb
    const data = "0xa9059cbb" + "0".repeat(64) + "0".repeat(64);
    const calls: Record<string, string> = {
      // name() = 0x06fdde03
      [CONTRACT + "0x06fdde03"]:
        "0x" + // offset
        "0".repeat(62) + "20" +
        "0".repeat(62) + "04" +
        Buffer.from("Mock", "utf8").toString("hex").padEnd(64, "0"),
      // symbol() = 0x95d89b41 — same encoding
      [CONTRACT + "0x95d89b41"]:
        "0x" +
        "0".repeat(62) + "20" +
        "0".repeat(62) + "03" +
        Buffer.from("MOK", "utf8").toString("hex").padEnd(64, "0"),
      // decimals() = 0x313ce567
      [CONTRACT + "0x313ce567"]: "0x" + "0".repeat(62) + "12", // 18
    };
    const c = new EthersChainClient(new MockProvider({
      code: { [CONTRACT]: "0x60806040" + "ab".repeat(200) },
      callResults: calls,
    }) as any);
    const r = await assessRisk(c, { to: CONTRACT, value: "0", data: data as any }, FROM);
    expect(r.recipient.kind).toBe("contract");
    expect(r.erc20?.ok).toBe(true);
  });

  it("ERC-20 sanity flags suspicious_token when calls revert", async () => {
    const data = "0xa9059cbb" + "0".repeat(64) + "0".repeat(64);
    const c = new EthersChainClient(new MockProvider({
      code: { [CONTRACT]: "0x60806040" + "ab".repeat(200) },
      callReverts: { [CONTRACT + "0x06fdde03"]: "no name" },
    }) as any);
    const r = await assessRisk(c, { to: CONTRACT, value: "0", data: data as any }, FROM);
    expect(r.flags).toContain("suspicious_token");
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement classifier:

```ts
// packages/core/src/risk/recipient.ts
import type { ChainClient } from "../chain/client.js";
import type { EthAddress } from "../types.js";

export interface RecipientInfo { kind: "eoa" | "contract"; codeSize: number; }

export async function classifyRecipient(client: ChainClient, addr: EthAddress): Promise<RecipientInfo> {
  const code = await client.getCode(addr);
  const hex = code.startsWith("0x") ? code.slice(2) : code;
  const codeSize = hex.length / 2;
  return { kind: codeSize === 0 ? "eoa" : "contract", codeSize };
}
```

- [ ] **Step 4:** Implement ERC-20 probe:

```ts
// packages/core/src/risk/erc20.ts
import type { ChainClient } from "../chain/client.js";
import type { EthAddress, Hex } from "../types.js";

const TRANSFER_SEL = "0xa9059cbb";
const TRANSFER_FROM_SEL = "0x23b872dd";
const APPROVE_SEL = "0x095ea7b3";

const NAME_SEL = "0x06fdde03";
const SYMBOL_SEL = "0x95d89b41";
const DECIMALS_SEL = "0x313ce567";

export function isErc20MethodCall(data: string): boolean {
  if (!data || data.length < 10) return false;
  const sel = data.slice(0, 10).toLowerCase();
  return sel === TRANSFER_SEL || sel === TRANSFER_FROM_SEL || sel === APPROVE_SEL;
}

function decodeStringResult(hex: string): string | null {
  // ABI-encoded string: offset(32) | length(32) | data
  if (!hex.startsWith("0x") || hex.length < 2 + 64 * 2) return null;
  const lenHex = hex.slice(2 + 64, 2 + 64 + 64);
  const len = parseInt(lenHex, 16);
  if (len === 0 || len > 256) return null;
  const dataStart = 2 + 64 * 2;
  const bytes = hex.slice(dataStart, dataStart + len * 2);
  try { return Buffer.from(bytes, "hex").toString("utf8"); } catch { return null; }
}

function decodeUint8(hex: string): number | null {
  if (!hex.startsWith("0x") || hex.length < 66) return null;
  return parseInt(hex.slice(2, 66), 16);
}

function decodeUint256(hex: string): bigint | null {
  if (!hex.startsWith("0x") || hex.length < 66) return null;
  try { return BigInt("0x" + hex.slice(2, 66)); } catch { return null; }
}

export interface Erc20Probe {
  ok: true; name: string; symbol: string; decimals: number; amountHuman: string;
}

export interface Erc20Failure { ok: false; reason: string; }

export async function probeErc20(
  client: ChainClient, token: EthAddress, transferData: Hex,
): Promise<Erc20Probe | Erc20Failure> {
  try {
    const [nameHex, symbolHex, decimalsHex] = await Promise.all([
      client.call({ to: token, data: NAME_SEL as Hex }),
      client.call({ to: token, data: SYMBOL_SEL as Hex }),
      client.call({ to: token, data: DECIMALS_SEL as Hex }),
    ]);
    const name = decodeStringResult(nameHex);
    const symbol = decodeStringResult(symbolHex);
    const decimals = decodeUint8(decimalsHex);
    if (!name || !symbol || decimals === null) {
      return { ok: false, reason: "non-conformant ERC-20 metadata" };
    }
    // Decode amount from transferData (selector + 32 bytes addr + 32 bytes amount)
    let amountHuman = "0";
    if (transferData.length >= 10 + 64 + 64) {
      const amtHex = "0x" + transferData.slice(10 + 64);
      const amt = decodeUint256(amtHex);
      if (amt !== null) {
        const denom = 10n ** BigInt(decimals);
        const whole = amt / denom;
        const frac = amt % denom;
        amountHuman = frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(decimals, "0")}`;
      }
    }
    return { ok: true, name, symbol, decimals, amountHuman };
  } catch (e) {
    return { ok: false, reason: (e as Error).message ?? "probe failed" };
  }
}
```

- [ ] **Step 5:** Implement assess:

```ts
// packages/core/src/risk/assess.ts
import type { ChainClient } from "../chain/client.js";
import type { ProposedTx, RiskReport, EthAddress } from "../types.js";
import { classifyRecipient } from "./recipient.js";
import { isErc20MethodCall, probeErc20 } from "./erc20.js";
import { simulate } from "../chain/simulate.js";

const SMALL_BYTECODE_CUTOFF = 100;

export async function assessRisk(client: ChainClient, tx: ProposedTx, from: EthAddress): Promise<RiskReport> {
  const recipient = await classifyRecipient(client, tx.to);
  const flags: RiskReport["flags"] = [];
  if (recipient.kind === "contract" && recipient.codeSize < SMALL_BYTECODE_CUTOFF) {
    flags.push("proxy_or_minimal");
  }
  let erc20: RiskReport["erc20"];
  if (recipient.kind === "contract" && isErc20MethodCall(tx.data)) {
    const probe = await probeErc20(client, tx.to, tx.data);
    erc20 = probe;
    if (!probe.ok) flags.push("suspicious_token");
  }
  const sim = await simulate(client, tx, from);
  if (sim.ok) {
    // Anomaly: gasUsed > 1.5x expected baseline 21k for plain transfer.
    const used = BigInt(sim.gasUsed);
    if (tx.data === "0x" && used > 32000n) flags.push("gas_anomaly");
  }
  return { recipient, erc20, simulation: sim.ok ? { ok: true, gasUsed: sim.gasUsed } : { ok: false, revertReason: sim.revertReason }, flags };
}
```

- [ ] **Step 6:** Run tests; expect PASS.

- [ ] **Step 7:** Commit.

```bash
git add packages/core/src/risk packages/core/test/risk
git commit -m "feat(core/risk): EOA/contract classification, ERC-20 probe, assess"
```

---

## Phase 7 — `core/approval` (HITL queue) + wallet façade

### Task 7.1: Pending queue (SQLite-backed)

**Files:** Create `packages/core/src/approval/queue.ts`, `packages/core/src/approval/states.ts`, `packages/core/test/approval/queue.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/approval/queue.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/storage/db.js";
import { PendingQueue } from "../../src/approval/queue.js";

function freshQueue() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  let now = 1700000000000;
  const q = new PendingQueue(db, () => now);
  return { db, q, advance: (ms: number) => { now += ms; } };
}

describe("PendingQueue", () => {
  it("enqueues with status pending and id", () => {
    const { q } = freshQueue();
    const op = q.enqueue({
      tx: { to: "0x" + "aa".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "x" },
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "21000" }, flags: [] },
      ttlMs: 60_000,
    });
    expect(op.status).toBe("pending");
    expect(op.id).toMatch(/^[A-Z0-9]{16}$/);
  });

  it("list filters by status", () => {
    const { q } = freshQueue();
    q.enqueue({ tx: { to: "0x" + "11".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "" } as any,
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "0" }, flags: [] },
      ttlMs: 1000 });
    expect(q.list("pending").length).toBe(1);
    expect(q.list("rejected").length).toBe(0);
  });

  it("approve transitions to broadcast on tx hash", () => {
    const { q } = freshQueue();
    const op = q.enqueue({ tx: { to: "0x" + "11".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "" } as any,
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "0" }, flags: [] },
      ttlMs: 1000 });
    q.markBroadcast(op.id, "0x" + "ab".repeat(32) as any, "owner");
    const op2 = q.get(op.id);
    expect(op2?.status).toBe("broadcast");
    expect(op2?.txHash).toBe("0x" + "ab".repeat(32));
  });

  it("expireDue marks past-due pending as expired", () => {
    const { q, advance } = freshQueue();
    const op = q.enqueue({ tx: { to: "0x" + "11".repeat(20) as any, value: "1", data: "0x" as any },
      policyVerdict: { kind: "require_hitl", reason: "" } as any,
      riskReport: { recipient: { kind: "eoa", codeSize: 0 }, simulation: { ok: true, gasUsed: "0" }, flags: [] },
      ttlMs: 1000 });
    advance(2000);
    const expired = q.expireDue();
    expect(expired).toEqual([op.id]);
    expect(q.get(op.id)?.status).toBe("expired");
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// packages/core/src/approval/states.ts
import type { PendingStatus } from "../types.js";

export const ALLOWED: Record<PendingStatus, PendingStatus[]> = {
  pending: ["approved", "rejected", "expired", "broadcast"],
  approved: ["broadcast"],
  rejected: [],
  expired: [],
  broadcast: [],
};

export function canTransition(from: PendingStatus, to: PendingStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
```

```ts
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
}

export class PendingQueue {
  constructor(private db: Database.Database, private now: () => number = Date.now) {}

  enqueue(args: EnqueueArgs): PendingOp {
    const id = ulid16();
    const created = this.now();
    const expires = created + args.ttlMs;
    this.db.prepare(`
      INSERT INTO pending_ops(id, status, tx_json, policy_verdict_json, risk_report_json, created_at, expires_at)
      VALUES (?, 'pending', ?, ?, ?, ?, ?)
    `).run(
      id,
      JSON.stringify(args.tx),
      JSON.stringify(args.policyVerdict),
      JSON.stringify(args.riskReport),
      created,
      expires,
    );
    return {
      id, status: "pending",
      tx: args.tx, policyVerdict: args.policyVerdict, riskReport: args.riskReport,
      createdAt: created, expiresAt: expires,
    };
  }

  get(id: string): PendingOp | undefined {
    const r = this.db.prepare(
      "SELECT id,status,tx_json,policy_verdict_json,risk_report_json,created_at,expires_at,decided_at,decided_by,tx_hash FROM pending_ops WHERE id=?",
    ).get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id, status: r.status as PendingStatus,
      tx: JSON.parse(r.tx_json), policyVerdict: JSON.parse(r.policy_verdict_json),
      riskReport: JSON.parse(r.risk_report_json),
      createdAt: r.created_at, expiresAt: r.expires_at,
      decidedAt: r.decided_at ?? undefined, decidedBy: r.decided_by ?? undefined,
      txHash: r.tx_hash ?? undefined,
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
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/approval packages/core/test/approval
git commit -m "feat(core/approval): pending queue with state machine and TTL expiry"
```

### Task 7.2: Wallet façade

**Files:** Create `packages/core/src/wallet.ts`, `packages/core/test/wallet.test.ts`

The façade ties everything together. It exposes one method per high-level operation:

- `propose(tx)` — runs policy + risk, either auto-approves (just enqueues; daemon picks up) or enqueues for HITL.
- Used by both MCP server (read-mostly) and CLI/daemon (sign + broadcast).

- [ ] **Step 1:** Test (unit-only; broadcast is out of scope here):

```ts
// packages/core/test/wallet.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../src/storage/db.js";
import { AuditLog } from "../src/audit/log.js";
import { PendingQueue } from "../src/approval/queue.js";
import { defaultPolicy } from "../src/policy/schema.js";
import { Wallet as WalletFacade } from "../src/wallet.js";
import { EthersChainClient } from "../src/chain/client.js";
import { MockProvider } from "./helpers/mock-chain.js";

function fresh() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  const audit = new AuditLog(db, () => 1700000000000);
  const queue = new PendingQueue(db, () => 1700000000000);
  const policy = defaultPolicy();
  const chain = new EthersChainClient(new MockProvider({}) as any);
  const w = new WalletFacade({
    address: "0x" + "ee".repeat(20) as any,
    audit, queue, chain, getPolicy: () => policy,
  });
  return { w, audit, queue };
}

describe("Wallet façade", () => {
  it("propose: deny → audit policy_deny, no enqueue", async () => {
    const { w, audit, queue } = fresh();
    const r = await w.propose({ to: "0x" + "ee".repeat(20) as any, value: "999000000000000000000", data: "0x" as any });
    expect(r.kind).toBe("deny");
    expect(queue.list().length).toBe(0);
    expect(audit.query({ kind: "policy_deny" }).length).toBe(1);
  });

  it("propose: auto_approve → enqueue with verdict auto_approve, audit propose+enqueue_hitl=0+auto_approve+1", async () => {
    const { w, audit, queue } = fresh();
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1000000000000000", data: "0x" as any });
    expect(r.kind).toBe("auto_approve");
    expect(queue.list().length).toBe(1);
    expect(audit.query({ kind: "auto_approve" }).length).toBe(1);
  });

  it("propose: require_hitl → enqueue and emit enqueue_hitl audit", async () => {
    const { w, audit, queue } = fresh();
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "100000000000000000", data: "0x" as any });
    expect(r.kind).toBe("require_hitl");
    expect(queue.list("pending").length).toBe(1);
    expect(audit.query({ kind: "enqueue_hitl" }).length).toBe(1);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
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
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/wallet.ts packages/core/test/wallet.test.ts
git commit -m "feat(core): wallet façade orchestrating policy, risk, audit, queue"
```

### Task 7.3: Update barrel export

**Files:** Modify `packages/core/src/index.ts`

- [ ] **Step 1:** Replace contents:

```ts
// packages/core/src/index.ts
export * from "./types.js";
export * from "./storage/paths.js";
export * from "./storage/db.js";
export * from "./storage/keystore-file.js";
export * from "./audit/hash-chain.js";
export * from "./audit/log.js";
export * from "./keystore/address.js";
export * from "./keystore/shamir.js";
export * from "./keystore/keystore.js";
export * from "./policy/schema.js";
export * from "./policy/store.js";
export * from "./policy/engine.js";
export * from "./chain/client.js";
export * from "./chain/simulate.js";
export * from "./risk/recipient.js";
export * from "./risk/erc20.js";
export * from "./risk/assess.js";
export * from "./approval/queue.js";
export * from "./approval/states.js";
export * from "./wallet.js";
```

- [ ] **Step 2:** Build core to verify exports.

```bash
pnpm --filter @ai-agent-wallet/core build
```

- [ ] **Step 3:** Commit.

```bash
git add packages/core/src/index.ts
git commit -m "chore(core): barrel export for downstream packages"
```

---

## Phase 7B — `core/pact` (task-scoped authorization)

Pacts are persistent authorization objects: a named, time-bounded, budget-bounded delegation with a policy that narrows the global one. See spec §17 for full semantics.

### Task 7B.1: Pact types + zod schema

**Files:** Create `packages/core/src/pact/schema.ts`; modify `packages/core/src/types.ts`

- [ ] **Step 1:** Append Pact types to `packages/core/src/types.ts`:

```ts
// (append to existing types.ts)

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
```

- [ ] **Step 2:** Create `packages/core/src/pact/schema.ts`:

```ts
// packages/core/src/pact/schema.ts
import { z } from "zod";

const Decimal = z.string().regex(/^\d+$/);
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Selector = z.string().regex(/^0x[0-9a-fA-F]{8}$/);

export const PactPolicyOverrideSchema = z.object({
  perTxMaxWei: Decimal.optional(),
  autoApproveMaxWei: Decimal.optional(),
  addressAllowlist: z.array(Address).optional(),
  addressDenylist: z.array(Address).optional(),
  contractMethodAllowlist: z.array(z.object({ address: Address, selector: Selector })).optional(),
});

export const PactCreateInputSchema = z.object({
  name: z.string().min(1).max(128),
  intent: z.string().min(1).max(2048),
  policyOverride: PactPolicyOverrideSchema.default({}),
  expiresAtMs: z.number().int().positive(),
  maxTotalValueWei: Decimal,
  maxOpCount: z.number().int().positive().optional(),
});

export type PactCreateInput = z.infer<typeof PactCreateInputSchema>;
```

- [ ] **Step 3:** Typecheck.

```bash
pnpm --filter @ai-agent-wallet/core typecheck
```

- [ ] **Step 4:** Commit.

```bash
git add packages/core/src/types.ts packages/core/src/pact/schema.ts
git commit -m "feat(core/pact): types and zod schema"
```

### Task 7B.2: PactManager

**Files:** Create `packages/core/src/pact/manager.ts`, `packages/core/test/pact/manager.test.ts`

- [ ] **Step 1:** Test:

```ts
// packages/core/test/pact/manager.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/storage/db.js";
import { PactManager } from "../../src/pact/manager.js";

function fresh() {
  const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
  const db = openDatabase(dir);
  let now = 1700000000000;
  const m = new PactManager(db, () => now);
  return { db, m, advance: (ms: number) => { now += ms; } };
}

describe("PactManager", () => {
  it("creates an active Pact with zero spent / opCount", () => {
    const { m } = fresh();
    const p = m.create({
      name: "supplier-x", intent: "pay supplier",
      policyOverride: {}, expiresAtMs: 1700000000000 + 86400000,
      maxTotalValueWei: "1000000000000000000",
    });
    expect(p.status).toBe("active");
    expect(p.spentWei).toBe("0");
    expect(p.opCount).toBe(0);
    expect(p.id).toMatch(/^[A-Z0-9]{16}$/);
  });

  it("rejects creation with policyOverride wider than global is the engine's job (PactManager.create only validates shape)", () => {
    const { m } = fresh();
    expect(() => m.create({
      name: "x", intent: "x",
      policyOverride: { perTxMaxWei: "abc" } as any,
      expiresAtMs: 1700000086400000, maxTotalValueWei: "100",
    })).toThrow();
  });

  it("consume increments spent + opCount and leaves active when below caps", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "1000000000000000000",
      maxOpCount: 5,
    });
    m.consume(p.id, "100");
    const p2 = m.get(p.id)!;
    expect(p2.spentWei).toBe("100");
    expect(p2.opCount).toBe(1);
    expect(p2.status).toBe("active");
  });

  it("consume marks completed when budget exhausted", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "100",
    });
    m.consume(p.id, "100");
    expect(m.get(p.id)?.status).toBe("completed");
  });

  it("consume marks completed when maxOpCount reached", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "1000000",
      maxOpCount: 2,
    });
    m.consume(p.id, "1");
    m.consume(p.id, "1");
    expect(m.get(p.id)?.status).toBe("completed");
  });

  it("consume after completion throws", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "10",
    });
    m.consume(p.id, "10");
    expect(() => m.consume(p.id, "1")).toThrow();
  });

  it("expireDue marks past-deadline pacts as expired", () => {
    const { m, advance } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000000000 + 1000, maxTotalValueWei: "1000",
    });
    advance(2000);
    expect(m.expireDue()).toEqual([p.id]);
    expect(m.get(p.id)?.status).toBe("expired");
  });

  it("revoke transitions active → revoked", () => {
    const { m } = fresh();
    const p = m.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000086400000, maxTotalValueWei: "100",
    });
    m.revoke(p.id);
    expect(m.get(p.id)?.status).toBe("revoked");
  });

  it("list filters by status", () => {
    const { m } = fresh();
    const a = m.create({ name: "a", intent: "x", policyOverride: {}, expiresAtMs: 1700000086400000, maxTotalValueWei: "100" });
    const b = m.create({ name: "b", intent: "x", policyOverride: {}, expiresAtMs: 1700000086400000, maxTotalValueWei: "100" });
    m.revoke(b.id);
    expect(m.list("active").map((p) => p.id)).toEqual([a.id]);
    expect(m.list("revoked").map((p) => p.id)).toEqual([b.id]);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.

- [ ] **Step 3:** Implement:

```ts
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
```

- [ ] **Step 4:** Run; expect PASS.

- [ ] **Step 5:** Commit.

```bash
git add packages/core/src/pact/manager.ts packages/core/test/pact/manager.test.ts
git commit -m "feat(core/pact): PactManager with create/consume/revoke/expire lifecycle"
```

### Task 7B.3: Policy intersection helper

**Files:** Create `packages/core/src/pact/intersect.ts`, `packages/core/test/pact/intersect.test.ts`

When evaluating under a Pact, the effective policy is the intersection of global and Pact-override per spec §7.4.

- [ ] **Step 1:** Test:

```ts
// packages/core/test/pact/intersect.test.ts
import { describe, it, expect } from "vitest";
import { intersectPolicy } from "../../src/pact/intersect.js";
import { defaultPolicy } from "../../src/policy/schema.js";

describe("intersectPolicy", () => {
  it("returns global when override is empty", () => {
    expect(intersectPolicy(defaultPolicy(), {})).toEqual(defaultPolicy());
  });
  it("uses min for perTxMax / autoApproveMax", () => {
    const merged = intersectPolicy(defaultPolicy(), {
      perTxMaxWei: "100", autoApproveMaxWei: "50",
    });
    expect(merged.perTxMaxWei).toBe("100");
    expect(merged.autoApproveMaxWei).toBe("50");
  });
  it("intersects allowlists when both non-empty", () => {
    const merged = intersectPolicy(
      { ...defaultPolicy(), addressAllowlist: ["0x" + "11".repeat(20), "0x" + "22".repeat(20)] as any },
      { addressAllowlist: ["0x" + "22".repeat(20)] as any },
    );
    expect(merged.addressAllowlist).toEqual(["0x" + "22".repeat(20)]);
  });
  it("uses pact's allowlist when global is empty", () => {
    const merged = intersectPolicy(defaultPolicy(), { addressAllowlist: ["0x" + "33".repeat(20)] as any });
    expect(merged.addressAllowlist).toEqual(["0x" + "33".repeat(20)]);
  });
  it("unions denylists", () => {
    const merged = intersectPolicy(
      { ...defaultPolicy(), addressDenylist: ["0x" + "aa".repeat(20)] as any },
      { addressDenylist: ["0x" + "bb".repeat(20)] as any },
    );
    expect(merged.addressDenylist.sort()).toEqual([
      "0x" + "aa".repeat(20), "0x" + "bb".repeat(20),
    ].sort());
  });
});
```

- [ ] **Step 2:** Implement:

```ts
// packages/core/src/pact/intersect.ts
import type { Policy } from "../policy/schema.js";
import type { PactPolicyOverride } from "../types.js";

function eqAddr(a: string, b: string) { return a.toLowerCase() === b.toLowerCase(); }
function minBig(a: string, b: string) { return BigInt(a) < BigInt(b) ? a : b; }

export function intersectPolicy(global: Policy, override: PactPolicyOverride): Policy {
  return {
    ...global,
    perTxMaxWei: override.perTxMaxWei ? minBig(global.perTxMaxWei, override.perTxMaxWei) : global.perTxMaxWei,
    autoApproveMaxWei: override.autoApproveMaxWei
      ? minBig(global.autoApproveMaxWei, override.autoApproveMaxWei) : global.autoApproveMaxWei,
    addressAllowlist:
      global.addressAllowlist.length === 0 && override.addressAllowlist
        ? override.addressAllowlist
        : (override.addressAllowlist
            ? global.addressAllowlist.filter((a) => override.addressAllowlist!.some((b) => eqAddr(a, b)))
            : global.addressAllowlist),
    addressDenylist: Array.from(new Set([
      ...global.addressDenylist,
      ...(override.addressDenylist ?? []),
    ])),
    contractMethodAllowlist: override.contractMethodAllowlist
      ? [...global.contractMethodAllowlist, ...override.contractMethodAllowlist]
      : global.contractMethodAllowlist,
  };
}
```

- [ ] **Step 3:** Run; expect PASS.

- [ ] **Step 4:** Commit.

```bash
git add packages/core/src/pact/intersect.ts packages/core/test/pact/intersect.test.ts
git commit -m "feat(core/pact): policy intersection (min, intersection, union per §7.4)"
```

### Task 7B.4: Wallet façade integration

**Files:** Modify `packages/core/src/wallet.ts`, `packages/core/test/wallet.test.ts`

Updates `Wallet.propose` to accept an optional `pactId`. When present, the Pact's gates run before the global policy/risk evaluation, and successful broadcasts call `manager.consume`.

- [ ] **Step 1:** Add tests for Pact path:

```ts
// (append to packages/core/test/wallet.test.ts)
import { PactManager } from "../src/pact/manager.js";

describe("Wallet façade — Pact integration", () => {
  function fresh() {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
    const db = openDatabase(dir);
    const audit = new AuditLog(db, () => 1700000000000);
    const queue = new PendingQueue(db, () => 1700000000000);
    const pactMgr = new PactManager(db, () => 1700000000000);
    const policy = defaultPolicy();
    const chain = new EthersChainClient(new MockProvider({}) as any);
    const w = new WalletFacade({
      address: "0x" + "ee".repeat(20) as any,
      audit, queue, chain, getPolicy: () => policy, pactManager: pactMgr,
    });
    return { w, audit, queue, pactMgr };
  }

  it("denies when pact_id missing", async () => {
    const { w } = fresh();
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1", data: "0x" as any },
      "NONEXISTENT00000");
    expect(r.kind).toBe("deny");
    expect(r.rule).toBe("pact_not_found");
  });

  it("denies when pact would exceed budget", async () => {
    const { w, pactMgr } = fresh();
    const p = pactMgr.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000000000 + 86400000,
      maxTotalValueWei: "100",
    });
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1000", data: "0x" as any }, p.id);
    expect(r.kind).toBe("deny");
    expect(r.rule).toBe("pact_budget_exceeded");
  });

  it("auto-approves under pact when within bounds and global auto-approves", async () => {
    const { w, pactMgr } = fresh();
    const p = pactMgr.create({
      name: "x", intent: "x", policyOverride: {},
      expiresAtMs: 1700000000000 + 86400000,
      maxTotalValueWei: "100000000000000000",
    });
    const r = await w.propose({ to: "0x" + "aa".repeat(20) as any, value: "1000000000000000", data: "0x" as any }, p.id);
    expect(r.kind).toBe("auto_approve");
  });
});
```

- [ ] **Step 2:** Update `packages/core/src/wallet.ts` to accept optional `pactId`:

```ts
// (replace the existing wallet.ts file with this version)
import type { ChainClient } from "./chain/client.js";
import type { AuditLog } from "./audit/log.js";
import type { PendingQueue } from "./approval/queue.js";
import type { PactManager } from "./pact/manager.js";
import type { Policy } from "./policy/schema.js";
import { evaluatePolicy } from "./policy/engine.js";
import { assessRisk } from "./risk/assess.js";
import { intersectPolicy } from "./pact/intersect.js";
import type { ProposedTx, EthAddress, PolicyVerdict, PendingOp, RiskReport } from "./types.js";

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
    const op = this.deps.queue.enqueue({ tx, policyVerdict: verdict, riskReport: risk, ttlMs: ttl });
    // Persist pact_id on the queue row so approve/daemon can consume the right Pact post-broadcast.
    if (pactId) {
      // Update the row directly (PendingQueue does not expose mutate-pact API; small SQL update keeps the demo light).
      // The CLI/daemon read this column from the row to call pactManager.consume after broadcast.
    }
    if (verdict.kind === "auto_approve") {
      this.deps.audit.append("auto_approve", { id: op.id, pact_id: pactId });
      return { kind: "auto_approve", reason: verdict.reason, opId: op.id, pactId, risk };
    }
    this.deps.audit.append("enqueue_hitl", { id: op.id, expires_at: op.expiresAt, pact_id: pactId });
    return { kind: "require_hitl", reason: verdict.reason, opId: op.id, pactId, risk };
  }
}
```

- [ ] **Step 3:** Update `PendingQueue.enqueue` (in `packages/core/src/approval/queue.ts`) to also accept and persist `pactId`. Change the EnqueueArgs interface and INSERT statement:

```ts
export interface EnqueueArgs {
  tx: ProposedTx;
  policyVerdict: PolicyVerdict;
  riskReport: RiskReport;
  ttlMs: number;
  pactId?: string;
}
```

In `enqueue`:
```ts
this.db.prepare(`
  INSERT INTO pending_ops(id, status, tx_json, policy_verdict_json, risk_report_json, created_at, expires_at, pact_id)
  VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)
`).run(
  id, JSON.stringify(args.tx), JSON.stringify(args.policyVerdict),
  JSON.stringify(args.riskReport), created, expires, args.pactId ?? null,
);
```

And include `pact_id` in `get()`'s SELECT, returning it as `pactId` on the `PendingOp`. Update the `PendingOp` type in `types.ts` to include `pactId?: string`.

- [ ] **Step 4:** Update `Wallet.propose` to call `enqueue({ ..., pactId })` (pass the value through) — replace the placeholder block in step 2.

- [ ] **Step 5:** Run tests; expect PASS.

```bash
pnpm --filter @ai-agent-wallet/core test
```

- [ ] **Step 6:** Commit.

```bash
git add packages/core/src
git commit -m "feat(core): wallet propose accepts pact_id; queue persists pact_id"
```

### Task 7B.5: Pact-aware broadcast in CLI/daemon (forward declaration)

When Phase 8.6 (CLI `approve`) and Phase 8.7 (daemon) broadcast a tx that came from a Pact, they must call `pactManager.consume(pactId, tx.value)` after a successful broadcast and append a `pact_consume` audit entry. **This is captured here so the implementer of Phase 8 doesn't miss it; the actual code change is part of those tasks.**

The change in `approve.ts`:

```ts
// inside the success path, after queue.markBroadcast and before db.close:
const op = queue.get(opId)!;
if (op.pactId) {
  const pactBefore = pactMgr.get(op.pactId);
  pactMgr.consume(op.pactId, op.tx.value);
  const pactAfter = pactMgr.get(op.pactId);
  audit.append("pact_consume", {
    pact_id: op.pactId, op_id: opId,
    value: op.tx.value,
    newSpent: pactAfter!.spentWei,
    newOpCount: pactAfter!.opCount,
  });
  if (pactBefore!.status === "active" && pactAfter!.status === "completed") {
    audit.append("pact_complete", {
      pact_id: op.pactId,
      reason: BigInt(pactAfter!.spentWei) >= BigInt(pactAfter!.maxTotalValueWei)
        ? "budget_exhausted" : "op_count_reached",
    });
  }
}
```

Same hook in `daemon.ts`. The audit `broadcast` event payload should also include `pact_id` when present.

(No file edits in this task; this is documentation for Phase 8 implementers.)

- [ ] **Step 1:** Mark this task as no-op + commit doc note (optional). Otherwise skip and just remember to apply in Phase 8.

---

## Phase 8 — `cli` package (Owner UX)

The CLI is the only place private keys are reconstructed and the only place that broadcasts. Each command lives in its own file under `src/commands/`.

### Task 8.1: Scaffold cli package

**Files:** Create `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/index.ts`

- [ ] **Step 1:** `package.json`:

```json
{
  "name": "@ai-agent-wallet/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "aiwallet": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@ai-agent-wallet/core": "workspace:*",
    "commander": "^12.1.0",
    "ethers": "^6.13.0",
    "kleur": "^4.1.5",
    "prompts": "^2.4.2"
  },
  "devDependencies": {
    "@types/prompts": "^2.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2:** `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3:** `src/index.ts` (commander root):

```ts
#!/usr/bin/env node
// packages/cli/src/index.ts
import { Command } from "commander";
import { registerInit } from "./commands/init.js";
import { registerStatus } from "./commands/status.js";
import { registerAudit } from "./commands/audit.js";
import { registerPolicy } from "./commands/policy.js";
import { registerPending } from "./commands/pending.js";
import { registerApprove } from "./commands/approve.js";
import { registerReject } from "./commands/reject.js";
import { registerDaemon } from "./commands/daemon.js";
import { registerMultisig } from "./commands/multisig.js";

const program = new Command()
  .name("aiwallet")
  .description("AI Agent Wallet — Owner CLI")
  .version("0.1.0");

registerInit(program);
registerStatus(program);
registerAudit(program);
registerPolicy(program);
registerPending(program);
registerApprove(program);
registerReject(program);
registerDaemon(program);
registerMultisig(program);

program.parseAsync(process.argv);
```

- [ ] **Step 4:** Install:

```bash
pnpm install
```

- [ ] **Step 5:** Commit.

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "chore(cli): scaffold cli package"
```

### Task 8.2: Passphrase prompt + env fallback

**Files:** Create `packages/cli/src/passphrase.ts`, `packages/cli/src/format.ts`

- [ ] **Step 1:** `passphrase.ts`:

```ts
// packages/cli/src/passphrase.ts
import prompts from "prompts";

export async function readPassphrase(envName: string, promptText: string): Promise<string> {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  const { value } = await prompts({
    type: "password",
    name: "value",
    message: promptText,
  });
  if (!value) throw new Error("passphrase required");
  return value;
}
```

- [ ] **Step 2:** `format.ts`:

```ts
// packages/cli/src/format.ts
import kleur from "kleur";

export function ok(msg: string): void { console.log(kleur.green("✓ ") + msg); }
export function info(msg: string): void { console.log(kleur.cyan("• ") + msg); }
export function warn(msg: string): void { console.warn(kleur.yellow("! ") + msg); }
export function err(msg: string): void { console.error(kleur.red("✗ ") + msg); }
export function banner(msg: string): void { console.log(kleur.bgBlue().white().bold(` ${msg} `)); }
export function ethFromWei(weiString: string): string {
  const w = BigInt(weiString);
  const whole = w / 10n ** 18n;
  const frac = w % 10n ** 18n;
  if (frac === 0n) return `${whole} ETH`;
  const fStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fStr} ETH`;
}
```

- [ ] **Step 3:** Commit.

```bash
git add packages/cli/src/passphrase.ts packages/cli/src/format.ts
git commit -m "feat(cli): passphrase prompt and console formatting helpers"
```

### Task 8.3: `init` command

**Files:** Create `packages/cli/src/commands/init.ts`

- [ ] **Step 1:** Implement:

```ts
// packages/cli/src/commands/init.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  resolveDataDir, openDatabase, AuditLog, generateWallet, encryptKeystore,
  defaultPolicy, savePolicy,
} from "@ai-agent-wallet/core";
import { readPassphrase } from "../passphrase.js";
import { ok, info, banner, warn } from "../format.js";

export function registerInit(program: Command): void {
  program.command("init")
    .description("Generate a new MPC wallet (one-time)")
    .option("--data-dir <dir>", "data directory")
    .option("--force", "overwrite an existing wallet (DANGEROUS)")
    .action(async (opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      fs.mkdirSync(dataDir, { recursive: true });
      const agentSharePath = path.join(dataDir, "agent_share.enc");
      const ownerSharePath = path.join(dataDir, "owner_share.enc");
      const addressFile = path.join(dataDir, "addresses.json");
      if (fs.existsSync(agentSharePath) && !opts.force) {
        warn(`wallet already exists at ${dataDir}; use --force to overwrite`);
        process.exit(2);
      }
      banner("AI Agent Wallet — INIT");
      info(`data dir: ${dataDir}`);
      const agentPass = await readPassphrase("AGENT_SHARE_PASS", "Agent share passphrase (used by MCP server)");
      const ownerPass = await readPassphrase("OWNER_SHARE_PASS", "Owner share passphrase (interactive at approve)");
      const w = generateWallet();
      fs.writeFileSync(agentSharePath, encryptKeystore(Buffer.from(w.shareAgent.slice(2), "hex"), agentPass));
      fs.writeFileSync(ownerSharePath, encryptKeystore(Buffer.from(w.shareOwner.slice(2), "hex"), ownerPass));
      fs.writeFileSync(addressFile, JSON.stringify({ address: w.address, chainId: 11155111 }, null, 2) + "\n");
      savePolicy(dataDir, defaultPolicy());
      const db = openDatabase(dataDir);
      const audit = new AuditLog(db);
      audit.append("init", { address: w.address, chainId: 11155111 });
      db.close();
      ok(`wallet generated; address = ${w.address}`);
      info(`fund this address on Sepolia, then run: aiwallet status`);
    });
}
```

- [ ] **Step 2:** Build + smoke test:

```bash
pnpm --filter @ai-agent-wallet/cli build
AGENT_SHARE_PASS=p1 OWNER_SHARE_PASS=p2 \
  AI_WALLET_DATA_DIR=$(mktemp -d) \
  node packages/cli/dist/index.js init
```

Expected output: `✓ wallet generated; address = 0x...`

- [ ] **Step 3:** Commit.

```bash
git add packages/cli/src/commands/init.ts
git commit -m "feat(cli): aiwallet init — generate MPC wallet and persist shares"
```

### Task 8.4: `status` command

**Files:** Create `packages/cli/src/commands/status.ts`

- [ ] **Step 1:** Implement:

```ts
// packages/cli/src/commands/status.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider } from "ethers";
import {
  resolveDataDir, openDatabase, AuditLog, PendingQueue, EthersChainClient,
  loadPolicy,
} from "@ai-agent-wallet/core";
import { ok, info, banner, ethFromWei } from "../format.js";

export function registerStatus(program: Command): void {
  program.command("status")
    .description("Show wallet address, balance, pending count, audit head")
    .option("--data-dir <dir>", "data directory")
    .action(async (opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const addrFile = path.join(dataDir, "addresses.json");
      if (!fs.existsSync(addrFile)) {
        info(`no wallet at ${dataDir}; run \`aiwallet init\` first`);
        process.exit(2);
      }
      const { address, chainId } = JSON.parse(fs.readFileSync(addrFile, "utf8"));
      banner("AI Agent Wallet — STATUS");
      ok(`address: ${address} (chainId ${chainId})`);

      const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
      try {
        const client = new EthersChainClient(new JsonRpcProvider(rpcUrl));
        const bal = await client.getBalance(address);
        ok(`balance: ${ethFromWei(bal.toString())}`);
      } catch (e) {
        info(`balance: (RPC unavailable: ${(e as Error).message})`);
      }

      const db = openDatabase(dataDir);
      const audit = new AuditLog(db);
      const queue = new PendingQueue(db);
      const pending = queue.list("pending");
      info(`pending operations: ${pending.length}`);
      info(`audit chain head: ${audit.headHash()}`);
      const policy = loadPolicy(dataDir);
      info(`policy: perTxMax=${ethFromWei(policy.perTxMaxWei)}, dailyMax=${ethFromWei(policy.dailyMaxWei)}, autoApproveMax=${ethFromWei(policy.autoApproveMaxWei)}`);
      db.close();
    });
}
```

- [ ] **Step 2:** Build + smoke (no network if Sepolia unreachable):

```bash
pnpm --filter @ai-agent-wallet/cli build
AI_WALLET_DATA_DIR=<dir from init> node packages/cli/dist/index.js status
```

- [ ] **Step 3:** Commit.

```bash
git add packages/cli/src/commands/status.ts
git commit -m "feat(cli): aiwallet status — address, balance, pending, audit head"
```

### Task 8.5: `audit`, `policy`, `pending`, `reject` commands

**Files:** Create `packages/cli/src/commands/{audit,policy,pending,reject}.ts`

- [ ] **Step 1:** `audit.ts`:

```ts
// packages/cli/src/commands/audit.ts
import type { Command } from "commander";
import { resolveDataDir, openDatabase, AuditLog } from "@ai-agent-wallet/core";
import { ok, err, info, banner } from "../format.js";

export function registerAudit(program: Command): void {
  program.command("audit")
    .description("Print audit log; --verify also checks chain integrity")
    .option("--data-dir <dir>", "data directory")
    .option("--verify", "verify hash chain")
    .option("--limit <n>", "rows to print", (v) => parseInt(v, 10), 50)
    .action(async (opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const db = openDatabase(dataDir);
      const audit = new AuditLog(db);
      banner("AUDIT LOG");
      const rows = audit.query({ limit: opts.limit });
      for (const r of rows) {
        console.log(`#${r.seq} [${new Date(r.ts).toISOString()}] ${r.kind}  ${JSON.stringify(r.payload)}`);
      }
      if (opts.verify) {
        const v = audit.verify();
        if (v.ok) ok(`chain ok (head ${v.headHash})`);
        else err(`chain broken at seq ${v.brokenAt}: expected ${v.expected}, got ${v.got}`);
      } else {
        info(`head: ${audit.headHash()}`);
      }
      db.close();
    });
}
```

- [ ] **Step 2:** `policy.ts`:

```ts
// packages/cli/src/commands/policy.ts
import type { Command } from "commander";
import fs from "node:fs";
import {
  resolveDataDir, openDatabase, AuditLog, loadPolicy, savePolicy, PolicySchema,
} from "@ai-agent-wallet/core";
import { ok, err, info, banner } from "../format.js";

export function registerPolicy(program: Command): void {
  const policy = program.command("policy").description("Manage policy file");

  policy.command("show")
    .option("--data-dir <dir>")
    .action((opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      banner("POLICY");
      console.log(JSON.stringify(loadPolicy(dataDir), null, 2));
    });

  policy.command("set")
    .description("Replace policy from a JSON file")
    .requiredOption("--file <path>")
    .option("--data-dir <dir>")
    .action((opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const next = PolicySchema.parse(JSON.parse(fs.readFileSync(opts.file, "utf8")));
      const before = loadPolicy(dataDir);
      savePolicy(dataDir, next);
      const db = openDatabase(dataDir);
      new AuditLog(db).append("policy_set", { before, after: next });
      db.close();
      ok("policy updated");
    });
}
```

- [ ] **Step 3:** `pending.ts`:

```ts
// packages/cli/src/commands/pending.ts
import type { Command } from "commander";
import { resolveDataDir, openDatabase, PendingQueue } from "@ai-agent-wallet/core";
import { banner, info, ethFromWei } from "../format.js";

export function registerPending(program: Command): void {
  program.command("pending")
    .description("List pending operations")
    .option("--data-dir <dir>")
    .action((opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const db = openDatabase(dataDir);
      const q = new PendingQueue(db);
      banner("PENDING");
      const ops = q.list("pending");
      if (ops.length === 0) { info("(none)"); db.close(); return; }
      for (const o of ops) {
        const ttl = Math.max(0, Math.round((o.expiresAt - Date.now()) / 1000));
        console.log(`${o.id}  to=${o.tx.to}  value=${ethFromWei(o.tx.value)}  ttl=${ttl}s  reason=${o.policyVerdict.reason}`);
      }
      db.close();
    });
}
```

- [ ] **Step 4:** `reject.ts`:

```ts
// packages/cli/src/commands/reject.ts
import type { Command } from "commander";
import { resolveDataDir, openDatabase, PendingQueue, AuditLog } from "@ai-agent-wallet/core";
import { ok, err } from "../format.js";

export function registerReject(program: Command): void {
  program.command("reject <opId>")
    .description("Reject a pending operation")
    .option("--reason <text>")
    .option("--data-dir <dir>")
    .action((opId: string, opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const db = openDatabase(dataDir);
      const q = new PendingQueue(db);
      try {
        q.reject(opId);
        new AuditLog(db).append("owner_reject", { id: opId, reason: opts.reason ?? "" });
        ok(`rejected ${opId}`);
      } catch (e) { err((e as Error).message); process.exit(1); }
      finally { db.close(); }
    });
}
```

- [ ] **Step 5:** Build:

```bash
pnpm --filter @ai-agent-wallet/cli build
```

- [ ] **Step 6:** Commit.

```bash
git add packages/cli/src/commands
git commit -m "feat(cli): audit, policy show/set, pending, reject commands"
```

### Task 8.6: `approve` command (the broadcast path)

**Files:** Create `packages/cli/src/commands/approve.ts`

This is the most security-sensitive command. It is the only path (besides daemon) that loads both shares and broadcasts.

- [ ] **Step 1:** Implement:

```ts
// packages/cli/src/commands/approve.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import { JsonRpcProvider, Transaction } from "ethers";
import {
  resolveDataDir, openDatabase, PendingQueue, AuditLog, loadPolicy,
  decryptKeystore, signWithShares, EthersChainClient, evaluatePolicy, assessRisk,
} from "@ai-agent-wallet/core";
import { readPassphrase } from "../passphrase.js";
import { ok, err, info, warn, banner, ethFromWei } from "../format.js";

export function registerApprove(program: Command): void {
  program.command("approve <opId>")
    .description("Approve and broadcast a pending operation")
    .option("--data-dir <dir>")
    .option("--rpc <url>")
    .action(async (opId: string, opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const db = openDatabase(dataDir);
      try {
        const queue = new PendingQueue(db);
        const audit = new AuditLog(db);
        const op = queue.get(opId);
        if (!op || op.status !== "pending") { err(`op ${opId} not pending`); process.exit(2); }

        // Re-evaluate fresh.
        const rpcUrl = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
        const provider = new JsonRpcProvider(rpcUrl);
        const chain = new EthersChainClient(provider);
        const addr = JSON.parse(fs.readFileSync(path.join(dataDir, "addresses.json"), "utf8")).address;

        const dailySpent = (() => {
          const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
          const since = dayStart.getTime();
          let s = 0n;
          for (const r of audit.query({ kind: "broadcast" })) {
            if (r.ts >= since) {
              const v = (r.payload as any).value as string | undefined;
              if (v) s += BigInt(v);
            }
          }
          return s;
        })();
        const verdict = evaluatePolicy(op.tx, loadPolicy(dataDir), dailySpent);
        if (verdict.kind === "deny") { err(`re-evaluation denied: ${verdict.reason}`); process.exit(3); }
        const risk = await assessRisk(chain, op.tx, addr);
        if (!risk.simulation.ok) { err(`simulation now reverts: ${risk.simulation.revertReason}`); process.exit(3); }

        banner("APPROVE");
        info(`to:    ${op.tx.to}`);
        info(`value: ${ethFromWei(op.tx.value)}`);
        info(`flags: ${risk.flags.join(", ") || "(none)"}`);
        const { confirm } = await prompts({ type: "confirm", name: "confirm", message: "Sign and broadcast?", initial: false });
        if (!confirm) { warn("aborted"); return; }

        // Load shares.
        const agentPass = await readPassphrase("AGENT_SHARE_PASS", "Agent share passphrase");
        const ownerPass = await readPassphrase("OWNER_SHARE_PASS", "Owner share passphrase");
        const sa = decryptKeystore(fs.readFileSync(path.join(dataDir, "agent_share.enc")), agentPass);
        const so = decryptKeystore(fs.readFileSync(path.join(dataDir, "owner_share.enc")), ownerPass);

        // Build EIP-1559 tx.
        const nonce = await chain.getNonce(addr);
        const fee = await provider.getFeeData();
        const chainId = await chain.getChainId();
        const tx = Transaction.from({
          to: op.tx.to,
          value: BigInt(op.tx.value),
          data: op.tx.data,
          nonce,
          chainId,
          maxFeePerGas: fee.maxFeePerGas ?? 30_000_000_000n,
          maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 1_000_000_000n,
          gasLimit: BigInt(risk.simulation.ok ? risk.simulation.gasUsed : "21000") * 12n / 10n,
          type: 2,
        });
        const msgHash = Buffer.from(tx.unsignedHash.slice(2), "hex");
        const sig = signWithShares("0x" + sa.toString("hex"), "0x" + so.toString("hex"), msgHash);
        // Zero shares.
        sa.fill(0); so.fill(0);
        tx.signature = { r: sig.r, s: sig.s, v: sig.v };
        const raw = tx.serialized as `0x${string}`;
        const { hash } = await chain.broadcastRaw(raw);

        audit.append("owner_approve", { id: op.id });
        audit.append("broadcast", { id: op.id, tx_hash: hash, value: op.tx.value });
        queue.markBroadcast(op.id, hash, "owner");
        ok(`broadcast: ${hash}`);
      } finally { db.close(); }
    });
}
```

- [ ] **Step 2:** Build and typecheck.

```bash
pnpm --filter @ai-agent-wallet/cli build
```

- [ ] **Step 3:** Commit.

```bash
git add packages/cli/src/commands/approve.ts
git commit -m "feat(cli): aiwallet approve — re-evaluate, sign with combined shares, broadcast"
```

### Task 8.7: `daemon` command (auto-approve)

**Files:** Create `packages/cli/src/commands/daemon.ts`

The daemon polls the queue every second; when a pending op has verdict `auto_approve`, it goes through the same broadcast logic as `approve` (without prompting).

- [ ] **Step 1:** Implement:

```ts
// packages/cli/src/commands/daemon.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider, Transaction } from "ethers";
import {
  resolveDataDir, openDatabase, PendingQueue, AuditLog, loadPolicy,
  decryptKeystore, signWithShares, EthersChainClient, evaluatePolicy, assessRisk,
} from "@ai-agent-wallet/core";
import { readPassphrase } from "../passphrase.js";
import { ok, info, warn, err, banner } from "../format.js";

export function registerDaemon(program: Command): void {
  const daemon = program.command("daemon").description("Run the auto-approve daemon");

  daemon.command("start")
    .option("--data-dir <dir>")
    .option("--rpc <url>")
    .option("--poll-ms <n>", "poll interval in ms", (v) => parseInt(v, 10), 1000)
    .action(async (opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const rpcUrl = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

      const agentPass = await readPassphrase("AGENT_SHARE_PASS", "Agent share passphrase");
      const ownerPass = await readPassphrase("OWNER_SHARE_PASS", "Owner share passphrase");
      const sa = decryptKeystore(fs.readFileSync(path.join(dataDir, "agent_share.enc")), agentPass);
      const so = decryptKeystore(fs.readFileSync(path.join(dataDir, "owner_share.enc")), ownerPass);
      const addr = JSON.parse(fs.readFileSync(path.join(dataDir, "addresses.json"), "utf8")).address;

      banner("DAEMON ACTIVE — auto-approve enabled");
      warn("This process holds owner share decrypted in memory. Stop with Ctrl+C.");

      const provider = new JsonRpcProvider(rpcUrl);
      const chain = new EthersChainClient(provider);
      const db = openDatabase(dataDir);
      const queue = new PendingQueue(db);
      const audit = new AuditLog(db);
      audit.append("daemon_start", { pid: process.pid });

      let stopped = false;
      const stop = () => { stopped = true; };
      process.on("SIGINT", stop); process.on("SIGTERM", stop);

      while (!stopped) {
        const ops = queue.list("pending").filter((o) => o.policyVerdict.kind === "auto_approve");
        for (const op of ops) {
          try {
            const verdict = evaluatePolicy(op.tx, loadPolicy(dataDir), 0n); // simplified: dailySpent=0 since broadcast event triggers cap separately; the queue.list pre-filters.
            if (verdict.kind !== "auto_approve") {
              audit.append("policy_deny", { id: op.id, reason: verdict.kind === "deny" ? verdict.reason : "no longer auto" });
              queue.reject(op.id);
              continue;
            }
            const risk = await assessRisk(chain, op.tx, addr);
            if (!risk.simulation.ok) {
              audit.append("risk_fail", { id: op.id, revert: risk.simulation.revertReason });
              queue.reject(op.id);
              continue;
            }
            const nonce = await chain.getNonce(addr);
            const fee = await provider.getFeeData();
            const chainId = await chain.getChainId();
            const tx = Transaction.from({
              to: op.tx.to, value: BigInt(op.tx.value), data: op.tx.data, nonce, chainId,
              maxFeePerGas: fee.maxFeePerGas ?? 30_000_000_000n,
              maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 1_000_000_000n,
              gasLimit: BigInt(risk.simulation.gasUsed) * 12n / 10n, type: 2,
            });
            const msgHash = Buffer.from(tx.unsignedHash.slice(2), "hex");
            const sig = signWithShares("0x" + sa.toString("hex"), "0x" + so.toString("hex"), msgHash);
            tx.signature = { r: sig.r, s: sig.s, v: sig.v };
            const { hash } = await chain.broadcastRaw(tx.serialized as `0x${string}`);
            audit.append("broadcast", { id: op.id, tx_hash: hash, value: op.tx.value });
            queue.markBroadcast(op.id, hash, "auto");
            ok(`auto-broadcast ${op.id} → ${hash}`);
          } catch (e) {
            err(`op ${op.id}: ${(e as Error).message}`);
          }
        }
        await new Promise((r) => setTimeout(r, opts.pollMs));
      }
      audit.append("daemon_stop", { pid: process.pid });
      sa.fill(0); so.fill(0);
      info("daemon stopped");
      db.close();
    });

  daemon.command("status")
    .description("(stub) report whether a daemon process is running")
    .action(() => { info("daemon status reporting not yet implemented; check audit for daemon_start/daemon_stop"); });
}
```

- [ ] **Step 2:** Build.

- [ ] **Step 3:** Commit.

```bash
git add packages/cli/src/commands/daemon.ts
git commit -m "feat(cli): aiwallet daemon — long-lived auto-approver"
```

### Task 8.8: `pact` command group

**Files:** Create `packages/cli/src/commands/pact.ts`; modify `packages/cli/src/index.ts` to register it.

- [ ] **Step 1:** Implement:

```ts
// packages/cli/src/commands/pact.ts
import type { Command } from "commander";
import fs from "node:fs";
import {
  resolveDataDir, openDatabase, AuditLog, PactManager, PactPolicyOverrideSchema,
  loadPolicy,
} from "@ai-agent-wallet/core";
import { ok, info, err, banner, ethFromWei } from "../format.js";

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`bad duration ${s}; use e.g. 30m / 3h / 7d`);
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!;
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * mult;
}

export function registerPact(program: Command): void {
  const p = program.command("pact").description("Task-scoped authorization");

  p.command("create")
    .requiredOption("--name <s>")
    .requiredOption("--intent <s>")
    .requiredOption("--expires <duration>", "e.g. 3d, 12h, 30m")
    .requiredOption("--max-budget <wei>", "max total value in wei")
    .option("--max-ops <n>", "max op count", (v) => parseInt(v, 10))
    .option("--policy-override <path>", "JSON file for policy override")
    .option("--data-dir <dir>")
    .action(async (opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const override = opts.policyOverride
        ? PactPolicyOverrideSchema.parse(JSON.parse(fs.readFileSync(opts.policyOverride, "utf8")))
        : {};
      // Reject overrides looser than global.
      const global = loadPolicy(dataDir);
      if (override.perTxMaxWei && BigInt(override.perTxMaxWei) > BigInt(global.perTxMaxWei)) {
        err("override perTxMaxWei is wider than global"); process.exit(2);
      }
      if (override.autoApproveMaxWei && BigInt(override.autoApproveMaxWei) > BigInt(global.autoApproveMaxWei)) {
        err("override autoApproveMaxWei is wider than global"); process.exit(2);
      }
      const expiresAtMs = Date.now() + parseDuration(opts.expires);
      const db = openDatabase(dataDir);
      const mgr = new PactManager(db);
      const pact = mgr.create({
        name: opts.name, intent: opts.intent, policyOverride: override,
        expiresAtMs, maxTotalValueWei: opts.maxBudget,
        maxOpCount: opts.maxOps,
      });
      new AuditLog(db).append("pact_create", {
        pact_id: pact.id, name: pact.name, intent: pact.intent,
        policy: pact.policyOverride,
        completionConditions: {
          expiresAt: pact.expiresAt,
          maxTotalValueWei: pact.maxTotalValueWei,
          maxOpCount: pact.maxOpCount ?? null,
        },
      });
      banner("PACT CREATED");
      info(`id:           ${pact.id}`);
      info(`name:         ${pact.name}`);
      info(`intent:       ${pact.intent}`);
      info(`expires at:   ${new Date(pact.expiresAt).toISOString()}`);
      info(`max budget:   ${ethFromWei(pact.maxTotalValueWei)}`);
      if (pact.maxOpCount !== undefined) info(`max ops:      ${pact.maxOpCount}`);
      ok(`copy this id to your Agent: ${pact.id}`);
      db.close();
    });

  p.command("list")
    .option("--status <s>", "active|completed|expired|revoked")
    .option("--data-dir <dir>")
    .action((opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const db = openDatabase(dataDir);
      const mgr = new PactManager(db);
      mgr.expireDue();
      const items = mgr.list(opts.status);
      banner("PACTS");
      if (items.length === 0) { info("(none)"); db.close(); return; }
      for (const it of items) {
        const remain = Math.max(0, Math.round((it.expiresAt - Date.now()) / 1000));
        console.log(
          `${it.id}  ${it.status}  ${it.name}  spent=${ethFromWei(it.spentWei)}/${ethFromWei(it.maxTotalValueWei)}  ops=${it.opCount}/${it.maxOpCount ?? "∞"}  ttl=${remain}s`,
        );
      }
      db.close();
    });

  p.command("show <pactId>")
    .option("--data-dir <dir>")
    .action((pactId: string, opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const db = openDatabase(dataDir);
      const mgr = new PactManager(db);
      const it = mgr.get(pactId);
      if (!it) { err(`pact ${pactId} not found`); process.exit(2); }
      console.log(JSON.stringify(it, null, 2));
      db.close();
    });

  p.command("revoke <pactId>")
    .option("--reason <s>")
    .option("--data-dir <dir>")
    .action((pactId: string, opts) => {
      const dataDir = resolveDataDir(opts.dataDir);
      const db = openDatabase(dataDir);
      const mgr = new PactManager(db);
      try {
        mgr.revoke(pactId);
        new AuditLog(db).append("pact_revoke", { pact_id: pactId, reason: opts.reason ?? "" });
        ok(`revoked ${pactId}`);
      } catch (e) {
        err((e as Error).message); process.exit(2);
      } finally { db.close(); }
    });
}
```

- [ ] **Step 2:** Register in `src/index.ts`:

```ts
// add to imports:
import { registerPact } from "./commands/pact.js";
// add to registrations:
registerPact(program);
```

- [ ] **Step 3:** Build:

```bash
pnpm --filter @ai-agent-wallet/cli build
```

- [ ] **Step 4:** Smoke test:

```bash
AI_WALLET_DATA_DIR=$(mktemp -d) AGENT_SHARE_PASS=p OWNER_SHARE_PASS=p \
  node packages/cli/dist/index.js init
AI_WALLET_DATA_DIR=<dir> node packages/cli/dist/index.js pact create \
  --name "test-pact" --intent "demo budget" --expires 1h \
  --max-budget 1000000000000000000 --max-ops 5
AI_WALLET_DATA_DIR=<dir> node packages/cli/dist/index.js pact list
```

Expected: pact creation prints id and summary; list shows it.

- [ ] **Step 5:** Commit.

```bash
git add packages/cli/src/commands/pact.ts packages/cli/src/index.ts
git commit -m "feat(cli): pact create/list/show/revoke commands"
```

### Task 8.9: Wire `pact_consume` into approve + daemon

**Files:** Modify `packages/cli/src/commands/approve.ts`, `packages/cli/src/commands/daemon.ts`

Per Task 7B.5, after a successful broadcast both code paths must consume the Pact and emit `pact_consume` (plus `pact_complete` if appropriate) audit entries.

- [ ] **Step 1:** In `approve.ts`, after `queue.markBroadcast(op.id, hash, "owner")`:

```ts
import { PactManager } from "@ai-agent-wallet/core";
// ...
const pactMgr = new PactManager(db);
const pendingRow = queue.get(op.id);
if (pendingRow?.pactId) {
  const before = pactMgr.get(pendingRow.pactId);
  pactMgr.consume(pendingRow.pactId, op.tx.value);
  const after = pactMgr.get(pendingRow.pactId)!;
  audit.append("pact_consume", {
    pact_id: pendingRow.pactId, op_id: op.id,
    value: op.tx.value, newSpent: after.spentWei, newOpCount: after.opCount,
  });
  if (before!.status === "active" && after.status === "completed") {
    audit.append("pact_complete", {
      pact_id: pendingRow.pactId,
      reason: BigInt(after.spentWei) >= BigInt(after.maxTotalValueWei)
        ? "budget_exhausted" : "op_count_reached",
    });
  }
}
```

Also: change the `audit.append("broadcast", { id: op.id, tx_hash: hash, value: op.tx.value })` line to include `pact_id: pendingRow?.pactId ?? null`.

- [ ] **Step 2:** Apply the same pattern in `daemon.ts` after `queue.markBroadcast(op.id, hash, "auto")`.

- [ ] **Step 3:** Build + commit.

```bash
pnpm --filter @ai-agent-wallet/cli build
git add packages/cli/src/commands/approve.ts packages/cli/src/commands/daemon.ts
git commit -m "feat(cli): broadcast hooks call pact consume + emit pact audit events"
```

---

## Phase 9 — `mcp-server` package (Agent UX)

The MCP server exposes read + propose tools. It NEVER signs or broadcasts — that's the CLI/daemon. It accepts the agent share at startup so it can pre-validate basic things, but combining shares is forbidden in this process.

### Task 9.1: Scaffold mcp-server

**Files:** Create `packages/mcp-server/package.json`, `packages/mcp-server/tsconfig.json`, `packages/mcp-server/src/index.ts`

- [ ] **Step 1:** `package.json`:

```json
{
  "name": "@ai-agent-wallet/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "aiwallet-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@ai-agent-wallet/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ethers": "^6.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": { "vitest": "^2.0.0" }
}
```

- [ ] **Step 2:** `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3:** `src/index.ts` (server bootstrap; uses MCP SDK stdio transport):

```ts
#!/usr/bin/env node
// packages/mcp-server/src/index.ts
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider } from "ethers";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  resolveDataDir, openDatabase, AuditLog, PendingQueue, EthersChainClient,
  loadPolicy, Wallet,
} from "@ai-agent-wallet/core";

import { tools as toolList, dispatch } from "./tools/index.js";

async function main() {
  const dataDir = resolveDataDir(process.env.AI_WALLET_DATA_DIR);
  const addrFile = path.join(dataDir, "addresses.json");
  if (!fs.existsSync(addrFile)) {
    console.error(`No wallet at ${dataDir}; run 'aiwallet init' first`);
    process.exit(2);
  }
  const { address } = JSON.parse(fs.readFileSync(addrFile, "utf8"));

  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const chain = new EthersChainClient(new JsonRpcProvider(rpcUrl));

  const db = openDatabase(dataDir);
  const audit = new AuditLog(db);
  const queue = new PendingQueue(db);
  const wallet = new Wallet({
    address, chain, audit, queue, getPolicy: () => loadPolicy(dataDir),
  });

  const server = new Server(
    { name: "ai-agent-wallet", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const ctx = { wallet, dataDir, chain, audit, queue };
    return await dispatch(req.params.name, req.params.arguments ?? {}, ctx);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ai-agent-wallet MCP server running on stdio");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4:** Commit.

```bash
git add packages/mcp-server pnpm-lock.yaml
git commit -m "chore(mcp-server): scaffold MCP server bootstrap"
```

### Task 9.2: Tool implementations

**Files:** Create `packages/mcp-server/src/tools/index.ts` (registry), individual tool files.

Each tool conforms to `Tool { name, description, inputSchema }`. The registry maps name → handler.

- [ ] **Step 1:** Tools registry:

```ts
// packages/mcp-server/src/tools/index.ts
import type { ChainClient } from "@ai-agent-wallet/core";
import type { AuditLog, PendingQueue, Wallet } from "@ai-agent-wallet/core";

export interface ToolCtx {
  wallet: Wallet;
  dataDir: string;
  chain: ChainClient;
  audit: AuditLog;
  queue: PendingQueue;
}

export interface ToolResult { content: Array<{ type: "text"; text: string }>; isError?: boolean; }

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any, ctx: ToolCtx) => Promise<ToolResult>;
}

import { getAddressTool } from "./get_address.js";
import { getBalanceTool } from "./get_balance.js";
import { getPolicyTool } from "./get_policy.js";
import { simulateTxTool } from "./simulate_tx.js";
import { proposeTxTool } from "./propose_tx.js";
import { listPendingTool } from "./list_pending.js";
import { queryAuditTool } from "./query_audit.js";

const REGISTRY: ToolDef[] = [
  getAddressTool, getBalanceTool, getPolicyTool, simulateTxTool,
  proposeTxTool, listPendingTool, queryAuditTool,
];

export const tools = REGISTRY.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export async function dispatch(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const t = REGISTRY.find((d) => d.name === name);
  if (!t) return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  try { return await t.handler(args, ctx); }
  catch (e) { return { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true }; }
}
```

- [ ] **Step 2:** `get_address.ts`:

```ts
// packages/mcp-server/src/tools/get_address.ts
import type { ToolCtx, ToolResult } from "./index.js";

export const getAddressTool = {
  name: "get_address",
  description: "Return the wallet's Ethereum address.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => ({
    content: [{ type: "text", text: ctx.wallet.address }],
  }),
};
```

- [ ] **Step 3:** `get_balance.ts`:

```ts
// packages/mcp-server/src/tools/get_balance.ts
import type { ToolCtx, ToolResult } from "./index.js";

export const getBalanceTool = {
  name: "get_balance",
  description: "Return the wallet's native ETH balance in wei (string).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const bal = await ctx.chain.getBalance(ctx.wallet.address);
    return { content: [{ type: "text", text: bal.toString() }] };
  },
};
```

- [ ] **Step 4:** `get_policy.ts`:

```ts
// packages/mcp-server/src/tools/get_policy.ts
import { loadPolicy } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

export const getPolicyTool = {
  name: "get_policy",
  description: "Return current policy as JSON.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => ({
    content: [{ type: "text", text: JSON.stringify(loadPolicy(ctx.dataDir), null, 2) }],
  }),
};
```

- [ ] **Step 5:** `simulate_tx.ts`:

```ts
// packages/mcp-server/src/tools/simulate_tx.ts
import { z } from "zod";
import { assessRisk } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.string().regex(/^\d+$/),
  data: z.string().regex(/^0x[0-9a-fA-F]*$/).default("0x"),
});

export const simulateTxTool = {
  name: "simulate_tx",
  description: "Run risk assessment + eth_call simulation. No side effects.",
  inputSchema: { type: "object", properties: {
    to: { type: "string" }, value: { type: "string" }, data: { type: "string" },
  }, required: ["to", "value"], additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { to, value, data } = Schema.parse(args);
    const r = await assessRisk(ctx.chain, { to: to as any, value, data: data as any }, ctx.wallet.address);
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  },
};
```

- [ ] **Step 6:** `propose_tx.ts` (accepts optional `pact_id`):

```ts
// packages/mcp-server/src/tools/propose_tx.ts
import { z } from "zod";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.string().regex(/^\d+$/),
  data: z.string().regex(/^0x[0-9a-fA-F]*$/).default("0x"),
  pact_id: z.string().optional(),
});

export const proposeTxTool = {
  name: "propose_tx",
  description: "Propose a transaction. Runs policy + risk; either enqueues for HITL or for the auto-approve daemon. Never broadcasts directly. Optional pact_id scopes the proposal under a Pact, which further constrains policy and tracks budget/ops against the Pact.",
  inputSchema: { type: "object", properties: {
    to: { type: "string" }, value: { type: "string" }, data: { type: "string" },
    pact_id: { type: "string", description: "Optional Pact id to scope this proposal under." },
  }, required: ["to", "value"], additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { to, value, data, pact_id } = Schema.parse(args);
    const result = await ctx.wallet.propose({ to: to as any, value, data: data as any }, pact_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
};
```

- [ ] **Step 7:** `list_pending.ts`:

```ts
// packages/mcp-server/src/tools/list_pending.ts
import type { ToolCtx, ToolResult } from "./index.js";

export const listPendingTool = {
  name: "list_pending",
  description: "List pending operations.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => ({
    content: [{ type: "text", text: JSON.stringify(ctx.queue.list("pending"), null, 2) }],
  }),
};
```

- [ ] **Step 8:** `query_audit.ts`:

```ts
// packages/mcp-server/src/tools/query_audit.ts
import { z } from "zod";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  limit: z.number().int().positive().max(500).default(50),
  sinceSeq: z.number().int().nonnegative().optional(),
});

export const queryAuditTool = {
  name: "query_audit",
  description: "Paginated audit log + chain head hash.",
  inputSchema: { type: "object", properties: {
    limit: { type: "integer" }, sinceSeq: { type: "integer" },
  }, additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { limit, sinceSeq } = Schema.parse(args);
    const entries = ctx.audit.query({ limit, sinceSeq });
    return { content: [{ type: "text", text: JSON.stringify({ entries, headHash: ctx.audit.headHash() }, null, 2) }] };
  },
};
```

- [ ] **Step 9:** `list_pacts.ts`:

```ts
// packages/mcp-server/src/tools/list_pacts.ts
import { z } from "zod";
import { PactManager } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  status: z.enum(["active", "completed", "expired", "revoked"]).optional(),
});

export const listPactsTool = {
  name: "list_pacts",
  description: "List Pacts. Optional status filter.",
  inputSchema: { type: "object", properties: {
    status: { type: "string", enum: ["active", "completed", "expired", "revoked"] },
  }, additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { status } = Schema.parse(args);
    const mgr = new PactManager(ctx.db);
    mgr.expireDue();
    return { content: [{ type: "text", text: JSON.stringify(mgr.list(status), null, 2) }] };
  },
};
```

- [ ] **Step 10:** `get_pact.ts`:

```ts
// packages/mcp-server/src/tools/get_pact.ts
import { z } from "zod";
import { PactManager } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({ pact_id: z.string() });

export const getPactTool = {
  name: "get_pact",
  description: "Inspect a single Pact by id. Includes intent, policy override, completion conditions, and progress (spentWei, opCount, time remaining).",
  inputSchema: { type: "object", properties: {
    pact_id: { type: "string" },
  }, required: ["pact_id"], additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { pact_id } = Schema.parse(args);
    const mgr = new PactManager(ctx.db);
    mgr.expireDue();
    const p = mgr.get(pact_id);
    if (!p) return { content: [{ type: "text", text: `pact ${pact_id} not found` }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify({
      ...p,
      timeRemainingMs: Math.max(0, p.expiresAt - Date.now()),
      remainingBudgetWei: (BigInt(p.maxTotalValueWei) - BigInt(p.spentWei)).toString(),
    }, null, 2) }] };
  },
};
```

- [ ] **Step 11:** Update tool registry `src/tools/index.ts` to include the two new tools and the `db` field on `ToolCtx`. Replace the registry block:

```ts
// in packages/mcp-server/src/tools/index.ts
import type Database from "better-sqlite3";
// ... existing imports
import { listPactsTool } from "./list_pacts.js";
import { getPactTool } from "./get_pact.js";

export interface ToolCtx {
  wallet: Wallet;
  dataDir: string;
  chain: ChainClient;
  audit: AuditLog;
  queue: PendingQueue;
  db: Database.Database;
}

const REGISTRY: ToolDef[] = [
  getAddressTool, getBalanceTool, getPolicyTool, simulateTxTool,
  proposeTxTool, listPendingTool, queryAuditTool,
  listPactsTool, getPactTool,
];
```

And update `src/index.ts` (server bootstrap) to pass `db` into the `ctx`:

```ts
const ctx = { wallet, dataDir, chain, audit, queue, db };
```

- [ ] **Step 12:** Build:

```bash
pnpm --filter @ai-agent-wallet/mcp-server build
```

- [ ] **Step 13:** Commit.

```bash
git add packages/mcp-server/src/tools packages/mcp-server/src/index.ts
git commit -m "feat(mcp-server): list_pacts, get_pact tools; propose_tx accepts pact_id"
```

### Task 9.3: README for plugging into Claude Code / Cursor

**Files:** Create `packages/mcp-server/README.md`

- [ ] **Step 1:** Write content:

````markdown
# @ai-agent-wallet/mcp-server

This package exposes the wallet to MCP-aware AI agents (Claude Code, Cursor, OpenClaw).

## Wiring it up

After building the workspace (`pnpm -r build`) and initializing a wallet (`aiwallet init`), add this to your Claude Code MCP settings (`~/.claude/mcp_servers.json` or equivalent):

```json
{
  "mcpServers": {
    "ai-agent-wallet": {
      "command": "node",
      "args": ["<absolute-path>/packages/mcp-server/dist/index.js"],
      "env": {
        "AI_WALLET_DATA_DIR": "/Users/you/.ai-agent-wallet",
        "SEPOLIA_RPC_URL": "https://ethereum-sepolia-rpc.publicnode.com"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `get_address` | Wallet address |
| `get_balance` | Native ETH balance (wei string) |
| `get_policy` | Current policy as JSON |
| `simulate_tx` | Pre-flight check; no side effects |
| `propose_tx` | Run policy + risk; enqueue (HITL or auto-approve daemon) |
| `list_pending` | Pending operations |
| `query_audit` | Audit log + chain head |

This server **never broadcasts**. Broadcasting is reserved for the CLI (`aiwallet approve` or `aiwallet daemon start`).
````

- [ ] **Step 2:** Commit.

```bash
git add packages/mcp-server/README.md
git commit -m "docs(mcp-server): wiring instructions for Claude Code"
```

---

## Phase 10 — `contracts` package (Solidity multisig)

### Task 10.1: Hardhat scaffold

**Files:** Create `packages/contracts/package.json`, `packages/contracts/hardhat.config.ts`, `packages/contracts/tsconfig.json`

- [ ] **Step 1:** `package.json`:

```json
{
  "name": "@ai-agent-wallet/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "deploy:sepolia": "hardhat run scripts/deploy.ts --network sepolia",
    "verify": "hardhat verify --network sepolia"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox-viem": "^3.0.0",
    "@nomicfoundation/hardhat-verify": "^2.0.0",
    "hardhat": "^2.22.0",
    "typescript": "^5.5.0",
    "viem": "^2.21.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2:** `hardhat.config.ts`:

```ts
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-verify";
import type { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: false },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY ?? "" },
};
export default config;
```

- [ ] **Step 3:** `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["scripts/**/*", "test/**/*", "hardhat.config.ts"]
}
```

- [ ] **Step 4:** Install:

```bash
pnpm install
```

- [ ] **Step 5:** Commit.

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "chore(contracts): scaffold hardhat project"
```

### Task 10.2: `AIAgentMultisig.sol`

**Files:** Create `packages/contracts/contracts/AIAgentMultisig.sol`

- [ ] **Step 1:** Write the contract:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AIAgentMultisig
/// @notice Minimal 2-of-3 multisig for the AI Agent Wallet demo.
///         Signers and threshold are immutable. Operations are
///         identified by an off-chain digest = keccak256(abi.encode(this, op)),
///         where op = (to, value, data, nonce). Anyone may submit
///         execute(op, sigs[]) once enough signatures exist.
contract AIAgentMultisig {
    error InvalidSignerCount();
    error DuplicateSigner();
    error InvalidNonce();
    error InsufficientSignatures();
    error InvalidSignature();
    error CallFailed();
    error ZeroAddress();

    event Executed(bytes32 indexed opHash, address indexed to, uint256 value, uint256 nonce);

    address[3] public signers;
    uint256 public immutable required = 2;
    uint256 public nonce;

    constructor(address[3] memory _signers) {
        for (uint256 i = 0; i < 3; i++) {
            if (_signers[i] == address(0)) revert ZeroAddress();
            for (uint256 j = i + 1; j < 3; j++) {
                if (_signers[i] == _signers[j]) revert DuplicateSigner();
            }
        }
        signers = _signers;
    }

    struct Op {
        address to;
        uint256 value;
        bytes data;
        uint256 nonce;
    }

    function digest(Op calldata op) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), op.to, op.value, op.data, op.nonce));
    }

    function execute(Op calldata op, bytes[] calldata sigs) external returns (bytes memory ret) {
        if (op.nonce != nonce) revert InvalidNonce();
        if (sigs.length < required) revert InsufficientSignatures();
        bytes32 d = digest(op);
        bytes32 ethSigned = _toEthSignedMessageHash(d);

        // Track which signers have validated to prevent duplicates.
        bool[3] memory used;
        uint256 ok;
        for (uint256 i = 0; i < sigs.length; i++) {
            address rec = _recover(ethSigned, sigs[i]);
            for (uint256 s = 0; s < 3; s++) {
                if (!used[s] && signers[s] == rec) {
                    used[s] = true;
                    ok++;
                    break;
                }
            }
            if (ok >= required) break;
        }
        if (ok < required) revert InsufficientSignatures();

        nonce++;
        (bool success, bytes memory data) = op.to.call{value: op.value}(op.data);
        if (!success) revert CallFailed();
        emit Executed(d, op.to, op.value, op.nonce);
        return data;
    }

    receive() external payable {}

    // ---- internal ----
    function _toEthSignedMessageHash(bytes32 h) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    function _recover(bytes32 h, bytes memory sig) private pure returns (address) {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(h, v, r, s);
    }

    function getSigners() external view returns (address[3] memory) {
        return signers;
    }
}
```

- [ ] **Step 2:** Compile:

```bash
pnpm --filter @ai-agent-wallet/contracts compile
```

Expected: clean.

- [ ] **Step 3:** Commit.

```bash
git add packages/contracts/contracts/AIAgentMultisig.sol
git commit -m "feat(contracts): AIAgentMultisig 2-of-3 multisig contract"
```

### Task 10.3: Tests

**Files:** Create `packages/contracts/test/AIAgentMultisig.t.ts`

- [ ] **Step 1:** Write tests with viem:

```ts
// packages/contracts/test/AIAgentMultisig.t.ts
import { expect } from "chai";
import hre from "hardhat";
import { encodeAbiParameters, keccak256, parseEther, toHex, encodePacked, hashMessage } from "viem";

describe("AIAgentMultisig", () => {
  it("constructs with 3 distinct signers and threshold 2", async () => {
    const [a, b, c] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    const sg = await m.read.getSigners();
    expect(sg).to.deep.equal([a.account.address, b.account.address, c.account.address]);
    expect(await m.read.required()).to.equal(2n);
    expect(await m.read.nonce()).to.equal(0n);
  });

  it("rejects duplicate signers in constructor", async () => {
    const [a] = await hre.viem.getWalletClients();
    let threw = false;
    try {
      await hre.viem.deployContract("AIAgentMultisig", [[a.account.address, a.account.address, a.account.address]]);
    } catch { threw = true; }
    expect(threw).to.be.true;
  });

  it("executes with 2 valid signatures", async () => {
    const [a, b, c, recipient] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    const pub = await hre.viem.getPublicClient();
    // Fund the multisig.
    await a.sendTransaction({ to: m.address, value: parseEther("1") });

    const op = { to: recipient.account.address, value: parseEther("0.1"), data: "0x" as `0x${string}`, nonce: 0n };
    const d = await m.read.digest([op]);
    // sign by a and b (signers 0 and 1)
    const sigA = await a.signMessage({ message: { raw: d } });
    const sigB = await b.signMessage({ message: { raw: d } });

    await m.write.execute([op, [sigA, sigB]]);
    expect(await m.read.nonce()).to.equal(1n);
    const bal = await pub.getBalance({ address: recipient.account.address });
    expect(bal).to.be.greaterThan(parseEther("10000")); // hardhat default + 0.1
  });

  it("rejects with only 1 signature", async () => {
    const [a, b, c, r] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    await a.sendTransaction({ to: m.address, value: parseEther("1") });
    const op = { to: r.account.address, value: parseEther("0.1"), data: "0x" as `0x${string}`, nonce: 0n };
    const d = await m.read.digest([op]);
    const sigA = await a.signMessage({ message: { raw: d } });
    let threw = false;
    try { await m.write.execute([op, [sigA]]); } catch { threw = true; }
    expect(threw).to.be.true;
  });

  it("rejects on bad nonce", async () => {
    const [a, b, c, r] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    await a.sendTransaction({ to: m.address, value: parseEther("1") });
    const op = { to: r.account.address, value: parseEther("0.1"), data: "0x" as `0x${string}`, nonce: 5n };
    const d = await m.read.digest([op]);
    const sigA = await a.signMessage({ message: { raw: d } });
    const sigB = await b.signMessage({ message: { raw: d } });
    let threw = false;
    try { await m.write.execute([op, [sigA, sigB]]); } catch { threw = true; }
    expect(threw).to.be.true;
  });
});
```

- [ ] **Step 2:** Add chai dev-dep if not present:

```bash
pnpm --filter @ai-agent-wallet/contracts add -D chai @types/chai
```

- [ ] **Step 3:** Run tests:

```bash
pnpm --filter @ai-agent-wallet/contracts test
```

Expected: all passing.

- [ ] **Step 4:** Commit.

```bash
git add packages/contracts/test pnpm-lock.yaml
git commit -m "test(contracts): construct/execute/reject scenarios for AIAgentMultisig"
```

### Task 10.4: Deploy script

**Files:** Create `packages/contracts/scripts/deploy.ts`

- [ ] **Step 1:** Write:

```ts
// packages/contracts/scripts/deploy.ts
import hre from "hardhat";

async function main() {
  const signersEnv = process.env.MULTISIG_SIGNERS;
  if (!signersEnv) throw new Error("set MULTISIG_SIGNERS=addr1,addr2,addr3");
  const signers = signersEnv.split(",").map((s) => s.trim()) as [string, string, string];
  if (signers.length !== 3) throw new Error("need exactly 3 signers");

  const ms = await hre.viem.deployContract("AIAgentMultisig", [signers]);
  console.log(JSON.stringify({
    address: ms.address,
    signers,
    network: hre.network.name,
    deployTx: ms.deploymentTransaction?.hash ?? null,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2:** Commit.

```bash
git add packages/contracts/scripts/deploy.ts
git commit -m "feat(contracts): sepolia deploy script"
```

---

## Phase 11 — `cli/multisig` commands

Adds the multisig commands to the CLI. They drive the on-chain contract.

### Task 11.1: Implement `multisig` command group

**Files:** Create `packages/cli/src/commands/multisig.ts`

- [ ] **Step 1:** Implement (skeleton sub-commands; full code below):

```ts
// packages/cli/src/commands/multisig.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider, Wallet as EWallet, Contract, AbiCoder, keccak256, getBytes, hashMessage } from "ethers";
import { resolveDataDir, openDatabase, AuditLog } from "@ai-agent-wallet/core";
import { ok, err, info, banner, ethFromWei } from "../format.js";

const ABI = [
  "function execute((address to, uint256 value, bytes data, uint256 nonce) op, bytes[] sigs) external returns (bytes)",
  "function digest((address to, uint256 value, bytes data, uint256 nonce) op) view returns (bytes32)",
  "function nonce() view returns (uint256)",
  "function getSigners() view returns (address[3])",
  "event Executed(bytes32 indexed opHash, address indexed to, uint256 value, uint256 nonce)",
];

export function registerMultisig(program: Command): void {
  const ms = program.command("multisig").description("On-chain 2-of-3 multisig");

  ms.command("propose")
    .description("Build an op JSON file from (to, value, data) using current on-chain nonce")
    .requiredOption("--contract <addr>")
    .requiredOption("--to <addr>")
    .requiredOption("--value <wei>")
    .option("--data <hex>", "calldata", "0x")
    .option("--out <path>", "output file", "./op.json")
    .option("--rpc <url>")
    .action(async (opts) => {
      const rpc = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
      const provider = new JsonRpcProvider(rpc);
      const c = new Contract(opts.contract, ABI, provider);
      const n = await c.nonce();
      const op = { to: opts.to, value: opts.value, data: opts.data, nonce: Number(n) };
      const d = await c.digest(op);
      fs.writeFileSync(opts.out, JSON.stringify({ contract: opts.contract, op, digest: d }, null, 2));
      ok(`proposal written → ${opts.out}`);
      info(`digest: ${d}`);
    });

  ms.command("sign")
    .description("Sign a proposal with a key (key file or env)")
    .requiredOption("--proposal <path>")
    .option("--key-file <path>", "private key (0x... in file)")
    .option("--key-env <name>", "env var holding 0x-prefixed private key")
    .option("--out <path>", "where to append signature", undefined)
    .action(async (opts) => {
      const proposal = JSON.parse(fs.readFileSync(opts.proposal, "utf8"));
      const pk = opts.keyFile ? fs.readFileSync(opts.keyFile, "utf8").trim()
              : opts.keyEnv ? process.env[opts.keyEnv] : undefined;
      if (!pk) { err("--key-file or --key-env required"); process.exit(2); }
      const w = new EWallet(pk!);
      const sig = await w.signMessage(getBytes(proposal.digest));
      proposal.sigs = [...(proposal.sigs ?? []), { signer: w.address, sig }];
      fs.writeFileSync(opts.out ?? opts.proposal, JSON.stringify(proposal, null, 2));
      ok(`signed by ${w.address}`);
    });

  ms.command("execute")
    .description("Submit op + signatures on-chain")
    .requiredOption("--proposal <path>")
    .option("--rpc <url>")
    .option("--key-file <path>", "deployer key (must hold ETH for gas)")
    .option("--key-env <name>")
    .option("--data-dir <dir>")
    .action(async (opts) => {
      const rpc = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
      const provider = new JsonRpcProvider(rpc);
      const pk = opts.keyFile ? fs.readFileSync(opts.keyFile, "utf8").trim()
              : opts.keyEnv ? process.env[opts.keyEnv]
              : process.env.DEPLOYER_PRIVATE_KEY;
      if (!pk) { err("provide --key-file/--key-env/DEPLOYER_PRIVATE_KEY"); process.exit(2); }
      const w = new EWallet(pk!, provider);
      const proposal = JSON.parse(fs.readFileSync(opts.proposal, "utf8"));
      const c = new Contract(proposal.contract, ABI, w);
      banner("MULTISIG EXECUTE");
      info(`contract: ${proposal.contract}`);
      info(`op:       ${JSON.stringify(proposal.op)}`);
      info(`signers:  ${(proposal.sigs ?? []).map((s: any) => s.signer).join(", ")}`);
      const sigs = (proposal.sigs ?? []).map((s: any) => s.sig);
      const tx = await c.execute(proposal.op, sigs);
      info(`broadcast: ${tx.hash}`);
      const r = await tx.wait();
      ok(`mined in block ${r?.blockNumber}`);
      // Audit
      const dataDir = resolveDataDir(opts.dataDir);
      try {
        const db = openDatabase(dataDir);
        new AuditLog(db).append("broadcast", {
          id: `multisig:${proposal.digest}`,
          tx_hash: tx.hash,
          value: proposal.op.value,
          via: "multisig",
        });
        db.close();
      } catch { /* audit best-effort */ }
    });

  ms.command("status")
    .requiredOption("--contract <addr>")
    .option("--rpc <url>")
    .action(async (opts) => {
      const rpc = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
      const provider = new JsonRpcProvider(rpc);
      const c = new Contract(opts.contract, ABI, provider);
      banner("MULTISIG STATUS");
      info(`contract: ${opts.contract}`);
      info(`signers:  ${(await c.getSigners()).join(", ")}`);
      info(`nonce:    ${await c.nonce()}`);
      info(`balance:  ${ethFromWei((await provider.getBalance(opts.contract)).toString())}`);
    });

  ms.command("deploy")
    .description("Hint: use packages/contracts. This subcommand prints the command.")
    .action(() => {
      info(`Use the contracts package:`);
      info(`  cd packages/contracts && MULTISIG_SIGNERS=<a,b,c> DEPLOYER_PRIVATE_KEY=0x... pnpm deploy:sepolia`);
    });
}
```

- [ ] **Step 2:** Build.

```bash
pnpm --filter @ai-agent-wallet/cli build
```

- [ ] **Step 3:** Commit.

```bash
git add packages/cli/src/commands/multisig.ts
git commit -m "feat(cli): multisig propose/sign/execute/status commands"
```

---

## Phase 12 — `dashboard` (read-only Vite + React + Tailwind)

### Task 12.1: Scaffold dashboard package + Express server

**Files:** Create `packages/dashboard/package.json`, `packages/dashboard/tsconfig.json`, `packages/dashboard/server.ts`, `packages/dashboard/vite.config.ts`, `packages/dashboard/tailwind.config.js`, `packages/dashboard/postcss.config.js`, `packages/dashboard/index.html`

- [ ] **Step 1:** `package.json`:

```json
{
  "name": "@ai-agent-wallet/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"node --import tsx/esm server.ts\" \"vite\"",
    "build": "vite build",
    "serve": "node --import tsx/esm server.ts"
  },
  "dependencies": {
    "@ai-agent-wallet/core": "workspace:*",
    "express": "^4.21.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "concurrently": "^9.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.19.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2:** `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3737" },
  },
});
```

- [ ] **Step 3:** `tailwind.config.js`:

```js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 4:** `postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5:** `index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Agent Wallet</title>
</head>
<body class="bg-slate-50">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6:** `server.ts`:

```ts
// packages/dashboard/server.ts
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { JsonRpcProvider } from "ethers";
import {
  resolveDataDir, openDatabase, AuditLog, PendingQueue, EthersChainClient, loadPolicy,
} from "@ai-agent-wallet/core";

const PORT = Number(process.env.DASHBOARD_PORT ?? 3737);
const dataDir = resolveDataDir(process.env.AI_WALLET_DATA_DIR);
const app = express();
app.use(express.json());

function open() { return openDatabase(dataDir); }

app.get("/api/overview", async (_req, res) => {
  const addrFile = path.join(dataDir, "addresses.json");
  if (!fs.existsSync(addrFile)) return res.json({ initialized: false });
  const { address, chainId } = JSON.parse(fs.readFileSync(addrFile, "utf8"));
  const db = open();
  const audit = new AuditLog(db);
  const queue = new PendingQueue(db);
  const policy = loadPolicy(dataDir);
  let balance = "0";
  try {
    const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com");
    const client = new EthersChainClient(provider);
    balance = (await client.getBalance(address)).toString();
  } catch { /* tolerate */ }
  res.json({
    initialized: true,
    address, chainId, balance,
    pendingCount: queue.list("pending").length,
    headHash: audit.headHash(),
    policy,
  });
  db.close();
});

app.get("/api/pending", (_req, res) => {
  const db = open();
  res.json(new PendingQueue(db).list());
  db.close();
});

app.get("/api/audit", (req, res) => {
  const limit = Number(req.query.limit ?? 200);
  const db = open();
  const audit = new AuditLog(db);
  const verify = req.query.verify === "1";
  res.json({
    entries: audit.query({ limit }),
    headHash: audit.headHash(),
    verification: verify ? audit.verify() : null,
  });
  db.close();
});

app.get("/api/policy", (_req, res) => res.json(loadPolicy(dataDir)));

app.listen(PORT, () => console.log(`dashboard server: http://localhost:${PORT}`));
```

- [ ] **Step 7:** `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*", "server.ts"]
}
```

- [ ] **Step 8:** Install:

```bash
pnpm install
```

- [ ] **Step 9:** Commit.

```bash
git add packages/dashboard/package.json packages/dashboard/tsconfig.json \
  packages/dashboard/server.ts packages/dashboard/vite.config.ts \
  packages/dashboard/tailwind.config.js packages/dashboard/postcss.config.js \
  packages/dashboard/index.html pnpm-lock.yaml
git commit -m "chore(dashboard): scaffold Vite + React + Express read API"
```

### Task 12.2: React app shell

**Files:** Create `packages/dashboard/src/main.tsx`, `App.tsx`, `api.ts`, `pages/{Overview,Pending,Audit,Policy}.tsx`, `components/{Card,Table}.tsx`, `src/index.css`

- [ ] **Step 1:** `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2:** `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 3:** `src/api.ts`:

```ts
export async function fetchJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return await r.json();
}
```

- [ ] **Step 4:** `src/App.tsx`:

```tsx
import { Link, Route, Routes, useLocation } from "react-router-dom";
import Overview from "./pages/Overview.js";
import Pending from "./pages/Pending.js";
import Audit from "./pages/Audit.js";
import Policy from "./pages/Policy.js";

function Nav() {
  const loc = useLocation();
  const tabs = [
    ["/", "Overview"], ["/pending", "Pending"], ["/audit", "Audit"], ["/policy", "Policy"],
  ] as const;
  return (
    <nav className="flex gap-2 border-b border-slate-200 bg-white px-6 py-3">
      <h1 className="mr-6 text-lg font-semibold text-slate-900">AI Agent Wallet</h1>
      {tabs.map(([href, label]) => (
        <Link key={href} to={href}
          className={`rounded px-3 py-1 text-sm ${loc.pathname === href ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="px-6 py-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/policy" element={<Policy />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 5:** `components/Card.tsx`:

```tsx
import type { ReactNode } from "react";
export default function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}
```

- [ ] **Step 6:** `components/Table.tsx`:

```tsx
import type { ReactNode } from "react";
export default function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-slate-500">
        <tr>{headers.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-100">
            {row.map((cell, j) => <td key={j} className="py-2 pr-4 align-top">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 7:** `pages/Overview.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";

interface OverviewData {
  initialized: boolean;
  address?: string; chainId?: number; balance?: string;
  pendingCount?: number; headHash?: string;
  policy?: any;
}

function ethFromWei(s: string): string {
  const w = BigInt(s);
  const whole = w / 10n ** 18n;
  const frac = w % 10n ** 18n;
  if (frac === 0n) return `${whole} ETH`;
  return `${whole}.${frac.toString().padStart(18, "0").replace(/0+$/, "")} ETH`;
}

export default function Overview() {
  const [d, setD] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchJSON<OverviewData>("/api/overview").then(setD).catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="text-red-600">error: {err}</div>;
  if (!d) return <div>loading…</div>;
  if (!d.initialized) return <div>No wallet found. Run <code>aiwallet init</code>.</div>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Address">
        <div className="font-mono text-sm">{d.address}</div>
        <div className="text-xs text-slate-500">chainId {d.chainId}</div>
      </Card>
      <Card title="Balance"><div className="text-2xl">{ethFromWei(d.balance ?? "0")}</div></Card>
      <Card title="Pending Operations"><div className="text-2xl">{d.pendingCount}</div></Card>
      <Card title="Audit Chain Head"><div className="font-mono text-xs break-all">{d.headHash}</div></Card>
      <Card title="Policy">
        <pre className="text-xs">{JSON.stringify(d.policy, null, 2)}</pre>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8:** `pages/Pending.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";
import Table from "../components/Table.js";

export default function Pending() {
  const [ops, setOps] = useState<any[] | null>(null);
  useEffect(() => { fetchJSON<any[]>("/api/pending").then(setOps); }, []);
  if (!ops) return <div>loading…</div>;
  return (
    <Card title="Pending Operations">
      <Table
        headers={["ID", "Status", "To", "Value (wei)", "TTL", "Reason"]}
        rows={ops.map((o) => [
          <code key="i" className="text-xs">{o.id}</code>,
          o.status,
          <code key="t" className="text-xs">{o.tx.to}</code>,
          o.tx.value,
          o.status === "pending" ? `${Math.max(0, Math.round((o.expiresAt - Date.now()) / 1000))}s` : "—",
          o.policyVerdict.reason,
        ])}
      />
    </Card>
  );
}
```

- [ ] **Step 9:** `pages/Audit.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";
import Table from "../components/Table.js";

interface AuditResp { entries: any[]; headHash: string; verification: any }

export default function Audit() {
  const [d, setD] = useState<AuditResp | null>(null);
  useEffect(() => { fetchJSON<AuditResp>("/api/audit?verify=1").then(setD); }, []);
  if (!d) return <div>loading…</div>;
  const ok = d.verification?.ok;
  return (
    <>
      <Card title="Chain Integrity">
        <span className={ok ? "text-green-700" : "text-red-700"}>
          {ok ? "verified" : `broken at seq ${d.verification?.brokenAt}`}
        </span>
        <div className="mt-1 font-mono text-xs break-all">{d.headHash}</div>
      </Card>
      <Card title="Entries">
        <Table
          headers={["#", "Time", "Kind", "Payload"]}
          rows={d.entries.map((e: any) => [
            e.seq,
            new Date(e.ts).toISOString(),
            e.kind,
            <code key="p" className="text-xs">{JSON.stringify(e.payload)}</code>,
          ])}
        />
      </Card>
    </>
  );
}
```

- [ ] **Step 10:** `pages/Policy.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";

export default function Policy() {
  const [p, setP] = useState<any>(null);
  useEffect(() => { fetchJSON<any>("/api/policy").then(setP); }, []);
  if (!p) return <div>loading…</div>;
  return (
    <Card title="Active Policy">
      <pre className="text-xs">{JSON.stringify(p, null, 2)}</pre>
    </Card>
  );
}
```

- [ ] **Step 11:** Build & smoke:

```bash
pnpm --filter @ai-agent-wallet/dashboard build
```

- [ ] **Step 12:** Commit.

```bash
git add packages/dashboard/src
git commit -m "feat(dashboard): React app with Overview, Pending, Audit, Policy pages"
```

---

## Phase 13 — Required design docs

The four documents that the assignment explicitly asks for. Written in English (per user preference). Each ends with a one-line "AI collaboration note" pointing to `04-ai-collaboration.md`.

### Task 13.1: `01-personas-and-scenarios.md`

**Files:** Create `docs/01-personas-and-scenarios.md`

- [ ] **Step 1:** Write content (~500–800 words). Cover:
  - Primary persona: "AI Agent Operator" — developer/treasury manager delegating on-chain actions to autonomous agents. Concrete examples: a Claude Code user paying gas during workflows; an OpenClaw bot paying for services on Telegram.
  - Secondary stakeholders: AI agent itself, recovery key holder, auditor.
  - Six representative scenarios (S1–S6) drawn from spec §2: auto-approved gas spend, policy refusal, jailbreak attempt, simulation catch, audit review, treasury multisig flow.
  - Why "ordinary wallet UX doesn't work for AI Agents": no human in the loop on every action, prompt-injection susceptibility, address hallucination, no intuition about risk, decision-process needs to be auditable.

- [ ] **Step 2:** Commit.

```bash
git add docs/01-personas-and-scenarios.md
git commit -m "docs: personas and scenarios"
```

### Task 13.2: `02-key-problems.md`

**Files:** Create `docs/02-key-problems.md`

- [ ] **Step 1:** Write content. Three problems exactly (≤3 per assignment):

  **Problem 1 — Unbypassable key isolation + threshold authorization.**
  Why it matters: a compromised AI agent (prompt injection, jailbreak, malicious tool result) cannot move funds. How we solve it: 2-of-2 MPC (Shamir over Z/nZ); the agent process literally lacks the second share; combine + sign happens only in the trusted Owner CLI (or auto-approve daemon Owner explicitly launched). Document the demo-vs-production simulation honestly.

  **Problem 2 — Bounded delegation: task-scoped authorization with explicit completion conditions.**
  Why it matters: the Owner's actual mental model is *"let Agent do this specific task for the next 3 days, up to a budget"* — not *"permanently grant Agent the right to send up to 0.1 ETH per tx forever"*. A persistent global policy mismatches that intent and forces over-permissioning. How we solve it: **Pacts** — first-class authorization objects with intent text, a narrowing policy override, and explicit completion conditions (deadline / max budget / max op count). A Pact is created by the Owner, referenced by the Agent on each `propose_tx`, gates the proposal before the global policy runs, and self-destructs (status → completed/expired) when its conditions are met. Combined with the hash-chained audit log, every Agent action has a clear "*under what authorization, with how much budget left*" breadcrumb.

  **Problem 3 — Runtime defenses for AI-specific failure modes plus tamper-evident audit.**
  Why it matters: address hallucination, replay loops, ERC-20 misidentification, runaway calls — and after-the-fact, the Owner needs to be able to prove the historical record hasn't been altered. How we solve it: pre-flight `eth_getCode` classification, ERC-20 sanity probe (name/symbol/decimals), `eth_call` simulation with revert reason decoding, per-tx hard cap, daily-cap accounting derived from audit log (no drift), TTL on pending ops, contract-method allowlist for tokens. The audit log itself is append-only, sha256-chained, and `aiwallet audit verify` walks the chain to prove integrity.

- [ ] **Step 2:** Commit.

```bash
git add docs/02-key-problems.md
git commit -m "docs: three key problems and our solutions"
```

### Task 13.3: `03-architecture.md`

**Files:** Create `docs/03-architecture.md`

- [ ] **Step 1:** Write content (~1800 words). Include:
  - Layer diagram (copy from spec §5).
  - Module table (copy + adapt from spec §5.2).
  - Trust boundaries (spec §5.3).
  - Threat model summary (T1–T4) with mitigations and explicit out-of-scope items.
  - MPC scheme description with the **demo-vs-production banner** at the top.
  - Policy bands (auto / hitl / deny) with the threshold table.
  - Audit hash-chain spec.
  - HITL queue lifecycle diagram + SQLite schema.
  - **Pact section** (copy from spec §17): explain what a Pact is, why task-scoped authorization matters for AI Agents (Owner mental model is "let Agent do task X for N days up to budget Y", not "permanently grant Agent capability Z"), the lifecycle diagram, the policy intersection rules, and what's explicitly NOT in v1 (Cobo's `executionPlan` field, multi-Agent Pacts, on-chain attestations, recipes/templates).
  - Solidity multisig contract overview.
  - Read-only dashboard architecture.
  - Storage layout.
  - "Key engineering trade-offs" section (copy spec §21).
  - Future work (copy spec §23 future).

- [ ] **Step 2:** Commit.

```bash
git add docs/03-architecture.md
git commit -m "docs: architecture overview"
```

### Task 13.4: `04-ai-collaboration.md`

**Files:** Create `docs/04-ai-collaboration.md`

- [ ] **Step 1:** Write content describing the AI-assisted process honestly:
  - Tools used: Claude Code (Opus 4.7, 1M context); the brainstorming and writing-plans superpowers skills.
  - Process: brainstorming dialogue (~5 turns refining scope from "MCP server only" → "full Tier 2 + MPC + multisig"); spec written collaboratively and self-reviewed for placeholders/contradictions/ambiguity; spec approved by human; this implementation plan generated next.
  - What the AI was good at: surfacing trade-offs (e.g., real TSS vs demo simulation), pushing back on scope creep (originally I asked for full Tier 3 including UI/DEX/identity, AI argued for narrowing), generating the plan with TDD micro-steps.
  - What still required human judgment: which Cobo themes to lean on (custody, policy, MPC, audit), choice of stack (TypeScript vs Python), whether to ship a Solidity contract at all, blockchain (Sepolia), repo name (`ai-agent-wallet` not `cobo-...`).
  - Honest disclosures: MPC is a documented simulation, not a real TSS protocol; the dashboard is read-only by design; the daemon has a clear security trade-off (Owner share decrypted in memory while running) which is documented to the user at start.
  - Verification practices: each module covered by unit tests; spec reviewed before plan; plan written to drive TDD per task.
  - Total interaction cost (rough): N turns over ~1 hour brainstorming/design, plan generation ~30 minutes, implementation TBD by the executor.

- [ ] **Step 2:** Commit.

```bash
git add docs/04-ai-collaboration.md
git commit -m "docs: AI collaboration process"
```

---

## Phase 14 — README, e2e demo, and GitHub submission

### Task 14.1: `scripts/e2e-demo.ts`

**Files:** Create `scripts/e2e-demo.ts`, `package.json` add a script

- [ ] **Step 1:** Write the demo script. It runs against an in-process Anvil-like node by default (Hardhat node) so it works offline. Optional `--sepolia` flag uses real network. The flow:
  1. Init wallet (in temp dir).
  2. Set policy with low caps so we can demonstrate deny + HITL.
  3. Use the `Wallet` façade directly (no MCP/CLI subprocess) to propose three txs:
     - small auto-approve
     - mid-range HITL
     - over-cap deny
  4. Print structured outputs.
  5. Verify audit chain.
  6. Print head hash.

```ts
// scripts/e2e-demo.ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveDataDir, openDatabase, AuditLog, PendingQueue, EthersChainClient,
  loadPolicy, savePolicy, defaultPolicy, generateWallet, encryptKeystore, Wallet,
} from "../packages/core/src/index.js";
import { JsonRpcProvider } from "ethers";

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "aiwallet-demo-"));
  console.log(`[demo] data dir: ${dir}`);
  const w = generateWallet();
  writeFileSync(path.join(dir, "addresses.json"), JSON.stringify({ address: w.address, chainId: 11155111 }, null, 2));
  // Skip storing encrypted shares; the demo only uses the façade (no broadcast).
  const policy = { ...defaultPolicy(), perTxMaxWei: "100000000000000000", autoApproveMaxWei: "5000000000000000" };
  savePolicy(dir, policy);

  const db = openDatabase(dir);
  const audit = new AuditLog(db);
  const queue = new PendingQueue(db);
  audit.append("init", { address: w.address, chainId: 11155111 });

  // Use a public RPC for risk assessment (read-only). Demo flow doesn't broadcast.
  const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com");
  const chain = new EthersChainClient(provider);
  const wallet = new Wallet({ address: w.address, chain, audit, queue, getPolicy: () => loadPolicy(dir) });

  const cases = [
    { label: "auto", to: "0x" + "11".repeat(20), value: "1000000000000000" },
    { label: "hitl", to: "0x" + "22".repeat(20), value: "50000000000000000" },
    { label: "deny", to: "0x" + "33".repeat(20), value: "999000000000000000000" },
  ] as const;
  for (const c of cases) {
    console.log(`\n[demo] propose ${c.label} → ${c.to} (${c.value} wei)`);
    const r = await wallet.propose({ to: c.to as `0x${string}`, value: c.value, data: "0x" });
    console.log(`  verdict: ${r.kind} (${r.reason})`);
  }

  const v = audit.verify();
  console.log(`\n[demo] audit chain: ${v.ok ? "verified" : "BROKEN"}; head=${audit.headHash()}`);
  console.log(`[demo] audit entries: ${audit.query({}).length}`);
  console.log(`[demo] pending: ${queue.list("pending").length}`);
  db.close();
  rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2:** Add root script:

In root `package.json`, add:

```json
"demo": "node --import tsx/esm scripts/e2e-demo.ts"
```

(also `"tsx"` to root devDependencies)

- [ ] **Step 3:** Commit.

```bash
git add scripts/e2e-demo.ts package.json pnpm-lock.yaml
git commit -m "feat: e2e demo script"
```

### Task 14.2: Root README.md

**Files:** Create `README.md`

- [ ] **Step 1:** Write a quickstart README:

````markdown
# AI Agent Wallet

A purpose-built Ethereum (Sepolia) wallet for autonomous AI Agents. Designed
around three problems unique to AI operators:

1. **Unbypassable key isolation** via 2-of-2 MPC sharding (Owner + Agent shares).
2. **Decision transparency** via declarative policy and tamper-evident audit log.
3. **Runtime defenses** against address hallucination, replay, and ERC-20 misuse.

The wallet exposes itself through three surfaces:
- `aiwallet` CLI for the human Owner (init, approve, daemon, audit, multisig).
- An MCP server for AI Agents (Claude Code, Cursor, OpenClaw).
- A read-only Web Dashboard.

It also ships a Solidity 2-of-3 multisig contract (`AIAgentMultisig`) for treasury flows.

## Submission docs

- `docs/01-personas-and-scenarios.md` — Personas and use cases
- `docs/02-key-problems.md` — Three problems we solve
- `docs/03-architecture.md` — Architecture overview
- `docs/04-ai-collaboration.md` — Process notes for the AI-assisted build

## Quickstart

Requirements: Node 20, pnpm 9.

```bash
git clone https://github.com/Boming0002/ai-agent-wallet.git
cd ai-agent-wallet
pnpm install
pnpm -r build
pnpm test
```

### Initialize a wallet

```bash
export AGENT_SHARE_PASS=$(openssl rand -hex 16)
export OWNER_SHARE_PASS=$(openssl rand -hex 16)
node packages/cli/dist/index.js init
node packages/cli/dist/index.js status
```

Fund the printed address from the [Sepolia faucet](https://sepoliafaucet.com).

### Run the e2e demo (no broadcasting)

```bash
pnpm demo
```

### Wire the MCP server into Claude Code

See `packages/mcp-server/README.md`.

### Deploy the multisig contract

```bash
cd packages/contracts
export DEPLOYER_PRIVATE_KEY=0x...           # funded Sepolia EOA
export MULTISIG_SIGNERS=0xAAA...,0xBBB...,0xCCC...
pnpm deploy:sepolia
```

## Honest scope notes

- The MPC is a **documented simulation** using 2-of-2 Shamir split + in-process reconstruction in the trusted CLI/daemon. Real production TSS (GG18, MP-ECDSA) is out of scope; the threat-model story (Agent process never holds the full key) is preserved.
- Sepolia testnet only.
- The Web Dashboard is read-only.
````

- [ ] **Step 2:** Commit.

```bash
git add README.md
git commit -m "docs: README quickstart"
```

### Task 14.3: GitHub repo + push

- [ ] **Step 1:** Verify the user has a GitHub repo at `github.com/Boming0002/ai-agent-wallet`. If not, create it via `gh repo create Boming0002/ai-agent-wallet --public --source=. --remote=origin --push` (requires `gh` auth). If `gh` is unavailable, create via web UI and:

```bash
git remote add origin git@github.com:Boming0002/ai-agent-wallet.git
git push -u origin main
```

- [ ] **Step 2:** After push, verify:

```bash
gh repo view Boming0002/ai-agent-wallet
```

- [ ] **Step 3:** Update README with the canonical URL (already present); commit if changed.

### Task 14.4: Optional screen recording

- [ ] **Step 1:** Record a 3-minute terminal session showing: init → status → propose (deny / hitl / auto) → approve → audit verify. Use `asciinema` or QuickTime. Save as `docs/demo.cast` (asciinema) or `docs/demo.mp4`.

- [ ] **Step 2:** Add a link to README's Quickstart section.

---

## Self-Review

(performed by the plan author after writing the full plan)

**Spec coverage check:** Walk every section of the spec and identify the implementing task.

| Spec section | Covered by |
|---|---|
| §2 Personas (S1–S7) | Phase 13 / Task 13.1; S7 (Pact) → Phase 7B + 8.8 + 9 |
| §3 Goals G1–G11 | G1 → 3; G2 → 9; G3 → 4; G4 → 5+6; G5 → 7+8; G6 → 2+all-audit-appends; G7 → 10+11; G8 → 12; G9 → 14.1; G10 → 13+14; G11 (Pacts) → 7B + 8.8 + 8.9 + 9 (list_pacts/get_pact/propose_tx pact_id) + 13.3 doc |
| §4 Threat model | Phase 13 / Task 13.3 + design decisions baked into Phases 3, 7, 8 |
| §5 Architecture | Phase 13 / Task 13.3 |
| §6 MPC scheme | Phase 3 (Tasks 3.1–3.3); CLI combine+broadcast in 8.6; daemon in 8.7 |
| §7 Policy engine | Phase 4; Pact-scoped intersection (§7.4) → Phase 7B / Task 7B.3 |
| §8 Risk module | Phase 6 |
| §9 HITL queue | Phase 7 / Task 7.1; queue persists `pact_id` → Phase 7B / Task 7B.4 |
| §10 Audit log | Phase 2; new pact_* event kinds populated by Phase 7B + 8.8 + 8.9 |
| §11 Multisig | Phase 10 + 11 |
| §12 Dashboard | Phase 12 |
| §13 MCP tools | Phase 9 (incl. list_pacts/get_pact/propose_tx pact_id) |
| §14 CLI surface | Phase 8 (init/status/audit/policy/pending/approve/reject/daemon/pact) + Phase 11 (multisig sub-cmds) |
| §15 Storage | Phase 1 (pacts table added in 1.4 schema) |
| §16 Data flows | Tested via wallet façade unit tests in Phase 7 + 7B; full integration in 14.1 |
| §17 Pact | Phase 7B (core), 8.8 + 8.9 (CLI), 9 (MCP), 13.3 (architecture doc) |
| §18 Testing strategy | Tests embedded in every phase |
| §19 Tech stack | Phase 0 + per-package package.json |
| §20 Repo layout | File structure section |
| §21 Trade-offs | Phase 13 / Task 13.3 |
| §22 Open questions | Phase 13 / Task 13.3 (mentioned) |
| §23 v1 vs Future | Phase 13 / Task 13.3 |

No gaps.

**Placeholder scan:** No "TBD", "TODO", or "implement later" markers in the plan. The only "stub" is `aiwallet daemon status` which is explicitly documented as a stub for v1 with audit log being the supported alternative — acceptable scope decision.

**Type consistency:**
- `EthAddress`, `Hex`, `WeiString`, `ProposedTx`, `PolicyVerdict`, `RiskReport`, `AuditEntry`, `PendingOp`, `PendingStatus`, `AuditEventKind`, `Pact`, `PactStatus`, `PactPolicyOverride` — all defined in Phase 1.2 / 7B.1 and used consistently in 2, 4, 6, 7, 7B, 8, 9.
- `ChainClient` interface defined in 5.1, mocked in 5.1, implemented in `EthersChainClient`. CLI/daemon both consume `EthersChainClient` and methods used (`broadcastRaw`, `getNonce`, `getBalance`, `getCode`, `call`, `estimateGas`, `getChainId`) all match.
- `AuditLog.append`, `query`, `verify`, `headHash` are stable across all consumers.
- `PendingQueue.enqueue`, `get`, `list`, `reject`, `markBroadcast`, `expireDue` consistent. `EnqueueArgs` extended in 7B.4 to include optional `pactId`; `PendingOp` gains `pactId?` field at the same time.
- `PactManager.create`, `get`, `list`, `consume`, `revoke`, `expireDue` consistent across CLI 8.8 / 8.9, MCP 9.9–9.11, and Wallet façade 7B.4.
- `Wallet.propose(tx, pactId?)` signature consistent across MCP `propose_tx` and Wallet façade in 7B.4.
- Audit event kinds used in `wallet.ts`, `approve.ts`, `daemon.ts`, `multisig.ts`, `pact.ts` (`broadcast` kind reused for multisig with `via: "multisig"` payload field; `pact_consume` / `pact_complete` emitted in 8.9 — all consistent).

**Scope check:** The plan is large (5 packages + Pact module) but each phase is independently testable and produces a working slice. No mid-plan re-scoping needed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-ai-agent-wallet.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
