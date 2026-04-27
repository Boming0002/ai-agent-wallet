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
