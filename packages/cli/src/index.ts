#!/usr/bin/env node
// packages/cli/src/index.ts
import { Command } from "commander";
import { registerInit } from "./commands/init.js";
import { registerStatus } from "./commands/status.js";
import { registerAudit } from "./commands/audit.js";
import { registerPolicy } from "./commands/policy.js";
import { registerPending } from "./commands/pending.js";
import { registerApprove } from "./commands/approve.js";
import { registerReject } from "./commands/reject.js";
import { registerDaemon } from "./commands/daemon.js";
import { registerPact } from "./commands/pact.js";
import { registerMultisig } from "./commands/multisig.js";

const program = new Command()
  .name("aiwallet")
  .description("AI Agent Wallet — Owner CLI")
  .version("0.1.0");

registerInit(program);
registerStatus(program);
registerAudit(program);
registerPolicy(program);
registerPending(program);
registerApprove(program);
registerReject(program);
registerDaemon(program);
registerPact(program);
registerMultisig(program);

program.parseAsync(process.argv);
