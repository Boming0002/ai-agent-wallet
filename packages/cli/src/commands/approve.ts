// packages/cli/src/commands/approve.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import { JsonRpcProvider, Transaction } from "ethers";
import {
  resolveDataDir, openDatabase, PendingQueue, AuditLog, loadPolicy,
  decryptKeystore, signWithShares, EthersChainClient, evaluatePolicy, assessRisk,
  PactManager,
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
        queue.markBroadcast(op.id, hash, "owner");

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

        ok(`broadcast: ${hash}`);
      } finally { db.close(); }
    });
}
