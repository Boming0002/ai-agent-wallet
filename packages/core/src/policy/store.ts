// packages/core/src/policy/store.ts
import fs from "node:fs";
import path from "node:path";
import { Policy, PolicySchema, defaultPolicy } from "./schema.js";

export function policyPath(dataDir: string): string {
  return path.join(dataDir, "policy.json");
}

export function loadPolicy(dataDir: string): Policy {
  const p = policyPath(dataDir);
  if (!fs.existsSync(p)) return defaultPolicy();
  return PolicySchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
}

export function savePolicy(dataDir: string, policy: Policy): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(policyPath(dataDir), JSON.stringify(policy, null, 2) + "\n");
}
