import os from "node:os";
import path from "node:path";

export function resolveDataDir(override?: string): string {
  if (override) return override;
  if (process.env.AI_WALLET_DATA_DIR) return process.env.AI_WALLET_DATA_DIR;
  return path.join(os.homedir(), ".ai-agent-wallet");
}
