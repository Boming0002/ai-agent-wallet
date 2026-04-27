// packages/mcp-server/src/tools/list_pending.ts
import type { ToolCtx, ToolResult } from "./index.js";

export const listPendingTool = {
  name: "list_pending",
  description: "List pending operations.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => ({
    content: [{ type: "text", text: JSON.stringify(ctx.queue.list("pending"), null, 2) }],
  }),
};
