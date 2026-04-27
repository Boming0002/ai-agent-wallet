// packages/mcp-server/src/tools/propose_tx.ts
import { z } from "zod";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.string().regex(/^\d+$/),
  data: z.string().regex(/^0x[0-9a-fA-F]*$/).default("0x"),
  pact_id: z.string().optional(),
});

export const proposeTxTool = {
  name: "propose_tx",
  description: "Propose a transaction. Runs policy + risk; either enqueues for HITL or for the auto-approve daemon. Never broadcasts directly. Optional pact_id scopes the proposal under a Pact, which further constrains policy and tracks budget/ops against the Pact.",
  inputSchema: { type: "object", properties: {
    to: { type: "string" }, value: { type: "string" }, data: { type: "string" },
    pact_id: { type: "string", description: "Optional Pact id to scope this proposal under." },
  }, required: ["to", "value"], additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { to, value, data, pact_id } = Schema.parse(args);
    const result = await ctx.wallet.propose(
      { to: to as `0x${string}`, value, data: data as `0x${string}` },
      pact_id,
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
};
