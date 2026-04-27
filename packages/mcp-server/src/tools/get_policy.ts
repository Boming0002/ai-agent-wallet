// packages/mcp-server/src/tools/get_policy.ts
import { loadPolicy } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

export const getPolicyTool = {
  name: "get_policy",
  description: "Return current policy as JSON.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (_a: unknown, ctx: ToolCtx): Promise<ToolResult> => ({
    content: [{ type: "text", text: JSON.stringify(loadPolicy(ctx.dataDir), null, 2) }],
  }),
};
