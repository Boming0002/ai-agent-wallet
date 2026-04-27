// packages/mcp-server/src/tools/get_pact.ts
import { z } from "zod";
import { PactManager } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({ pact_id: z.string() });

export const getPactTool = {
  name: "get_pact",
  description: "Inspect a single Pact by id. Includes intent, policy override, completion conditions, and progress (spentWei, opCount, time remaining).",
  inputSchema: { type: "object", properties: {
    pact_id: { type: "string" },
  }, required: ["pact_id"], additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { pact_id } = Schema.parse(args);
    const mgr = new PactManager(ctx.db);
    mgr.expireDue();
    const p = mgr.get(pact_id);
    if (!p) return { content: [{ type: "text", text: `pact ${pact_id} not found` }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify({
      ...p,
      timeRemainingMs: Math.max(0, p.expiresAt - Date.now()),
      remainingBudgetWei: (BigInt(p.maxTotalValueWei) - BigInt(p.spentWei)).toString(),
    }, null, 2) }] };
  },
};
