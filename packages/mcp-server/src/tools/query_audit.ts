// packages/mcp-server/src/tools/query_audit.ts
import { z } from "zod";
import type { ToolCtx, ToolResult } from "./index.js";

const Schema = z.object({
  limit: z.number().int().positive().max(500).default(50),
  sinceSeq: z.number().int().nonnegative().optional(),
});

export const queryAuditTool = {
  name: "query_audit",
  description: "Paginated audit log + chain head hash.",
  inputSchema: { type: "object", properties: {
    limit: { type: "integer" }, sinceSeq: { type: "integer" },
  }, additionalProperties: false },
  handler: async (args: unknown, ctx: ToolCtx): Promise<ToolResult> => {
    const { limit, sinceSeq } = Schema.parse(args);
    const queryOpts = sinceSeq !== undefined ? { limit, sinceSeq } : { limit };
    const entries = ctx.audit.query(queryOpts);
    return { content: [{ type: "text", text: JSON.stringify({ entries, headHash: ctx.audit.headHash() }, null, 2) }] };
  },
};
