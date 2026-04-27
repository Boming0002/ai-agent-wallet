// packages/mcp-server/src/tools/get_address.ts
import type { ToolCtx, ToolResult } from "./index.js";

export const getAddressTool = {
  name: "get_address",
  description: "Return the wallet's Ethereum address.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => ({
    content: [{ type: "text", text: ctx.wallet.address }],
  }),
};
