// packages/mcp-server/src/tools/index.ts
import type Database from "better-sqlite3";
import type { ChainClient, AuditLog, PendingQueue, Wallet } from "@ai-agent-wallet/core";

export interface ToolCtx {
  wallet: Wallet;
  dataDir: string;
  chain: ChainClient;
  audit: AuditLog;
  queue: PendingQueue;
  db: Database.Database;
}

export interface ToolResult { content: Array<{ type: "text"; text: string }>; isError?: boolean; }

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, ctx: ToolCtx) => Promise<ToolResult>;
}

import { getAddressTool } from "./get_address.js";
import { getBalanceTool } from "./get_balance.js";
import { getPolicyTool } from "./get_policy.js";
import { simulateTxTool } from "./simulate_tx.js";
import { proposeTxTool } from "./propose_tx.js";
import { listPendingTool } from "./list_pending.js";
import { queryAuditTool } from "./query_audit.js";
import { listPactsTool } from "./list_pacts.js";
import { getPactTool } from "./get_pact.js";

const REGISTRY: ToolDef[] = [
  getAddressTool, getBalanceTool, getPolicyTool, simulateTxTool,
  proposeTxTool, listPendingTool, queryAuditTool,
  listPactsTool, getPactTool,
];

export const tools = REGISTRY.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export async function dispatch(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const t = REGISTRY.find((d) => d.name === name);
  if (!t) return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  try { return await t.handler(args, ctx); }
  catch (e) { return { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true }; }
}
