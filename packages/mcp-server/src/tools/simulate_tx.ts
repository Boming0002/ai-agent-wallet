// packages/mcp-server/src/tools/simulate_tx.ts
import { z } from "zod";
import { assessRisk } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.string().regex(/^\d+$/),
  data: z.string().regex(/^0x[0-9a-fA-F]*$/).default("0x"),
});

export const simulateTxTool = {
  name: "simulate_tx",
  description: "Run risk assessment + eth_call simulation. No side effects.",
  inputSchema: { type: "object", properties: {
    to: { type: "string" }, value: { type: "string" }, data: { type: "string" },
  }, required: ["to", "value"], additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { to, value, data } = Schema.parse(args);
    const r = await assessRisk(
      ctx.chain,
      { to: to as `0x${string}`, value, data: data as `0x${string}` },
      ctx.wallet.address,
    );
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  },
};
