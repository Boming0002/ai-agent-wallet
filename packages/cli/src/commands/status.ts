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
