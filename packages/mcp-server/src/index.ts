#!/usr/bin/env node
// packages/mcp-server/src/index.ts
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider } from "ethers";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  resolveDataDir, openDatabase, AuditLog, PendingQueue, EthersChainClient,
  loadPolicy, PactManager, Wallet,
} from "@ai-agent-wallet/core";

import { tools as toolList, dispatch } from "./tools/index.js";

async function main() {
  const dataDir = resolveDataDir(process.env.AI_WALLET_DATA_DIR);
  const addrFile = path.join(dataDir, "addresses.json");
  if (!fs.existsSync(addrFile)) {
    console.error(`No wallet at ${dataDir}; run 'aiwallet init' first`);
    process.exit(2);
  }
  const { address } = JSON.parse(fs.readFileSync(addrFile, "utf8")) as { address: string };

  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const chain = new EthersChainClient(new JsonRpcProvider(rpcUrl));

  const db = openDatabase(dataDir);
  const audit = new AuditLog(db);
  const queue = new PendingQueue(db);
  const pactManager = new PactManager(db);
  const wallet = new Wallet({
    address: address as `0x${string}`,
    chain,
    audit,
    queue,
    pactManager,
    getPolicy: () => loadPolicy(dataDir),
  });

  const server = new Server(
    { name: "ai-agent-wallet", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const ctx = { wallet, dataDir, chain, audit, queue, db };
    const result = await dispatch(req.params.name, req.params.arguments ?? {}, ctx);
    return result as CallToolResult;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ai-agent-wallet MCP server running on stdio");
}

main().catch((e) => { console.error(e); process.exit(1); });
