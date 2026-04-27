# @ai-agent-wallet/mcp-server

This package exposes the wallet to MCP-aware AI agents (Claude Code, Cursor, OpenClaw).

## Wiring it up

After building the workspace (`pnpm -r build`) and initializing a wallet (`aiwallet init`), add this to your Claude Code MCP settings (`~/.claude/mcp_servers.json` or equivalent):

```json
{
  "mcpServers": {
    "ai-agent-wallet": {
      "command": "node",
      "args": ["<absolute-path>/packages/mcp-server/dist/index.js"],
      "env": {
        "AI_WALLET_DATA_DIR": "/Users/you/.ai-agent-wallet",
        "SEPOLIA_RPC_URL": "https://ethereum-sepolia-rpc.publicnode.com"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `get_address` | Wallet address |
| `get_balance` | Native ETH balance (wei string) |
| `get_policy` | Current policy as JSON |
| `simulate_tx` | Pre-flight check; no side effects |
| `propose_tx` | Run policy + risk; enqueue (HITL or auto-approve daemon). Accepts optional `pact_id` |
| `list_pending` | Pending operations |
| `query_audit` | Audit log + chain head |
| `list_pacts` | List Pacts, filterable by status |
| `get_pact` | Single Pact detail incl. spent/opCount/timeRemaining |

This server **never broadcasts**. Broadcasting is reserved for the CLI (`aiwallet approve` or `aiwallet daemon start`).
