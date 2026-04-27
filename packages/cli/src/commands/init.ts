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
