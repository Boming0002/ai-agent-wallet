// packages/dashboard/server.ts
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { JsonRpcProvider } from "ethers";
import {
  resolveDataDir, openDatabase, AuditLog, PendingQueue, EthersChainClient, loadPolicy,
} from "@ai-agent-wallet/core";

const PORT = Number(process.env.DASHBOARD_PORT ?? 3737);
const dataDir = resolveDataDir(process.env.AI_WALLET_DATA_DIR);
const app = express();
app.use(express.json());

function open() { return openDatabase(dataDir); }

app.get("/api/overview", async (_req, res) => {
  const addrFile = path.join(dataDir, "addresses.json");
  if (!fs.existsSync(addrFile)) return res.json({ initialized: false });
  const { address, chainId } = JSON.parse(fs.readFileSync(addrFile, "utf8"));
  const db = open();
  const audit = new AuditLog(db);
  const queue = new PendingQueue(db);
  const policy = loadPolicy(dataDir);
  let balance = "0";
  try {
    const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com");
    const client = new EthersChainClient(provider);
    balance = (await client.getBalance(address)).toString();
  } catch { /* tolerate */ }
  res.json({
    initialized: true,
    address, chainId, balance,
    pendingCount: queue.list("pending").length,
    headHash: audit.headHash(),
    policy,
  });
  db.close();
});

app.get("/api/pending", (_req, res) => {
  const db = open();
  res.json(new PendingQueue(db).list());
  db.close();
});

app.get("/api/audit", (req, res) => {
  const limit = Number(req.query.limit ?? 200);
  const db = open();
  const audit = new AuditLog(db);
  const verify = req.query.verify === "1";
  res.json({
    entries: audit.query({ limit }),
    headHash: audit.headHash(),
    verification: verify ? audit.verify() : null,
  });
  db.close();
});

app.get("/api/policy", (_req, res) => res.json(loadPolicy(dataDir)));

app.listen(PORT, () => console.log(`dashboard server: http://localhost:${PORT}`));
