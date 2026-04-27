// scripts/e2e-demo.ts
//
// End-to-end demo: creates a fresh wallet in a temp dir, sets a tight policy,
// proposes three transactions (auto-approve, hitl, deny), verifies the audit
// chain, and prints a summary. No broadcasting occurs.
//
// Uses an in-process mock ChainClient so the demo works fully offline.
// Set SEPOLIA_RPC_URL to use a live Sepolia node for risk simulation instead.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChainClient } from "../packages/core/src/chain/client.js";
import type { EthAddress, Hex } from "../packages/core/src/types.js";
import {
  openDatabase,
  AuditLog,
  PendingQueue,
  EthersChainClient,
  makeProvider,
  loadPolicy,
  savePolicy,
  defaultPolicy,
  generateWallet,
  PactManager,
  Wallet,
} from "../packages/core/src/index.js";

// ---------------------------------------------------------------------------
// Offline mock — always simulates success as a funded EOA would.
// ---------------------------------------------------------------------------
class MockChainClient implements ChainClient {
  async getBalance(_addr: EthAddress): Promise<bigint> { return 10n * 10n ** 18n; }
  async getCode(_addr: EthAddress): Promise<string> { return "0x"; }
  async call(_tx: { to: EthAddress; data: Hex }): Promise<string> { return "0x"; }
  async estimateGas(_tx: { to: EthAddress; data: Hex; value: bigint; from: EthAddress }): Promise<bigint> {
    return 21000n;
  }
  async getNonce(_addr: EthAddress): Promise<number> { return 0; }
  async broadcastRaw(_raw: Hex): Promise<{ hash: Hex }> {
    throw new Error("MockChainClient: broadcasting not supported in demo");
  }
  async getChainId(): Promise<number> { return 11155111; }
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "aiwallet-demo-"));
  console.log(`[demo] data dir: ${dir}`);

  const w = generateWallet();
  writeFileSync(
    path.join(dir, "addresses.json"),
    JSON.stringify({ address: w.address, chainId: 11155111 }, null, 2),
  );

  // Tight policy so we can demonstrate all three verdicts in one run.
  //   auto  → value <= 0.005 ETH
  //   hitl  → 0.005 ETH < value <= 0.1 ETH
  //   deny  → value > 0.1 ETH  (perTxMaxWei)
  const policy = {
    ...defaultPolicy(),
    perTxMaxWei:        "100000000000000000",  // 0.1 ETH
    autoApproveMaxWei:  "5000000000000000",    // 0.005 ETH
  };
  savePolicy(dir, policy);

  const db = openDatabase(dir);
  const audit = new AuditLog(db);
  const queue = new PendingQueue(db);
  const pactManager = new PactManager(db);
  audit.append("init", { address: w.address, chainId: 11155111 });

  // Use live Sepolia RPC when available; fall back to offline mock.
  const sepoliaUrl = process.env.SEPOLIA_RPC_URL;
  const chain: ChainClient = sepoliaUrl
    ? new EthersChainClient(makeProvider(sepoliaUrl))
    : new MockChainClient();

  console.log(`[demo] chain client: ${sepoliaUrl ? `live Sepolia (${sepoliaUrl})` : "offline mock"}`);
  console.log(`[demo] wallet:       ${w.address}`);
  console.log(`[demo] policy:       perTxMax=0.1 ETH  autoMax=0.005 ETH\n`);

  const wallet = new Wallet({
    address: w.address,
    chain,
    audit,
    queue,
    pactManager,
    getPolicy: () => loadPolicy(dir),
  });

  const cases = [
    { label: "auto",  to: "0x" + "11".repeat(20), value: "1000000000000000"       }, // 0.001 ETH → auto
    { label: "hitl",  to: "0x" + "22".repeat(20), value: "50000000000000000"      }, // 0.05 ETH  → hitl
    { label: "deny",  to: "0x" + "33".repeat(20), value: "999000000000000000000"  }, // 999 ETH   → deny
  ] as const;

  for (const c of cases) {
    console.log(`[demo] propose ${c.label}`);
    console.log(`       to:      ${c.to}`);
    console.log(`       value:   ${c.value} wei`);
    const r = await wallet.propose({ to: c.to as `0x${string}`, value: c.value, data: "0x" });
    console.log(`       verdict: ${r.kind}`);
    console.log(`       reason:  ${r.reason}`);
    console.log();
  }

  const v = audit.verify();
  const head = audit.headHash();
  const entries = audit.query({}).length;
  const pending = queue.list("pending").length;

  console.log(`[demo] ── Audit Summary ──`);
  console.log(`[demo] chain verified: ${v.ok ? "YES" : "NO (BROKEN)"}`);
  console.log(`[demo] head hash:      ${head}`);
  console.log(`[demo] total entries:  ${entries}`);
  console.log(`[demo] pending queue:  ${pending} item(s)`);

  db.close();
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n[demo] temp dir cleaned up. Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
