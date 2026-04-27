// packages/mcp-server/src/tools/get_balance.ts
import type { ToolCtx, ToolResult } from "./index.js";

export const getBalanceTool = {
  name: "get_balance",
  description: "Return the wallet's native ETH balance in wei (string).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const bal = await ctx.chain.getBalance(ctx.wallet.address);
    return { content: [{ type: "text", text: bal.toString() }] };
  },
};
