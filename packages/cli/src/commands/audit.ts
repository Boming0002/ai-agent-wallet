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
