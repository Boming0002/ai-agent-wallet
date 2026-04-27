// packages/mcp-server/src/tools/list_pacts.ts
import { z } from "zod";
import { PactManager } from "@ai-agent-wallet/core";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  status: z.enum(["active", "completed", "expired", "revoked"]).optional(),
});

export const listPactsTool = {
  name: "list_pacts",
  description: "List Pacts. Optional status filter.",
  inputSchema: { type: "object", properties: {
    status: { type: "string", enum: ["active", "completed", "expired", "revoked"] },
  }, additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { status } = Schema.parse(args);
    const mgr = new PactManager(ctx.db);
    mgr.expireDue();
    return { content: [{ type: "text", text: JSON.stringify(mgr.list(status), null, 2) }] };
  },
};
