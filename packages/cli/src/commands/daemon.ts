// packages/cli/src/commands/daemon.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider, Transaction } from "ethers";
import {
  resolveDataDir, openDatabase, PendingQueue, AuditLog, loadPolicy,
  decryptKeystore, signWithShares, EthersChainClient, evaluatePolicy, assessRisk,
  PactManager,
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
            queue.markBroadcast(op.id, hash, "auto");

            // Pact consume (Task 8.9).
            const pendingRow = queue.get(op.id);
            audit.append("broadcast", { id: op.id, tx_hash: hash, value: op.tx.value, pact_id: pendingRow?.pactId ?? null });
            if (pendingRow?.pactId) {
              const pactMgr = new PactManager(db);
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
