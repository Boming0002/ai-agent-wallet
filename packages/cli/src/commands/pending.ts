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
