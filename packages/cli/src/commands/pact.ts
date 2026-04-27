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
