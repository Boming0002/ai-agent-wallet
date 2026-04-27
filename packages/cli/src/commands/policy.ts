// packages/cli/src/commands/policy.ts
import type { Command } from "commander";
import fs from "node:fs";
import {
  resolveDataDir, openDatabase, AuditLog, loadPolicy, savePolicy, PolicySchema,
} from "@ai-agent-wallet/core";
import { ok, info, banner } from "../format.js";

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
      info("policy updated successfully");
    });
}
