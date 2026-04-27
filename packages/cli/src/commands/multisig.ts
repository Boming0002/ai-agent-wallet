// packages/cli/src/commands/multisig.ts
import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider, Wallet as EWallet, Contract, AbiCoder, keccak256, getBytes, hashMessage } from "ethers";
import { resolveDataDir, openDatabase, AuditLog } from "@ai-agent-wallet/core";
import { ok, err, info, banner, ethFromWei } from "../format.js";

const ABI = [
  "function execute((address to, uint256 value, bytes data, uint256 nonce) op, bytes[] sigs) external returns (bytes)",
  "function digest((address to, uint256 value, bytes data, uint256 nonce) op) view returns (bytes32)",
  "function nonce() view returns (uint256)",
  "function getSigners() view returns (address[3])",
  "event Executed(bytes32 indexed opHash, address indexed to, uint256 value, uint256 nonce)",
];

export function registerMultisig(program: Command): void {
  const ms = program.command("multisig").description("On-chain 2-of-3 multisig");

  ms.command("propose")
    .description("Build an op JSON file from (to, value, data) using current on-chain nonce")
    .requiredOption("--contract <addr>")
    .requiredOption("--to <addr>")
    .requiredOption("--value <wei>")
    .option("--data <hex>", "calldata", "0x")
    .option("--out <path>", "output file", "./op.json")
    .option("--rpc <url>")
    .action(async (opts) => {
      const rpc = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
      const provider = new JsonRpcProvider(rpc);
      const c = new Contract(opts.contract, ABI, provider);
      const n = await (c.nonce as (...args: unknown[]) => Promise<unknown>)();
      const op = { to: opts.to, value: opts.value, data: opts.data, nonce: Number(n) };
      const d = await (c.digest as (...args: unknown[]) => Promise<string>)(op);
      fs.writeFileSync(opts.out, JSON.stringify({ contract: opts.contract, op, digest: d }, null, 2));
      ok(`proposal written → ${opts.out}`);
      info(`digest: ${d}`);
    });

  ms.command("sign")
    .description("Sign a proposal with a key (key file or env)")
    .requiredOption("--proposal <path>")
    .option("--key-file <path>", "private key (0x... in file)")
    .option("--key-env <name>", "env var holding 0x-prefixed private key")
    .option("--out <path>", "where to append signature", undefined)
    .action(async (opts) => {
      const proposal = JSON.parse(fs.readFileSync(opts.proposal, "utf8"));
      const pk = opts.keyFile ? fs.readFileSync(opts.keyFile, "utf8").trim()
              : opts.keyEnv ? process.env[opts.keyEnv] : undefined;
      if (!pk) { err("--key-file or --key-env required"); process.exit(2); }
      const w = new EWallet(pk!);
      const sig = await w.signMessage(getBytes(proposal.digest));
      proposal.sigs = [...(proposal.sigs ?? []), { signer: w.address, sig }];
      fs.writeFileSync(opts.out ?? opts.proposal, JSON.stringify(proposal, null, 2));
      ok(`signed by ${w.address}`);
    });

  ms.command("execute")
    .description("Submit op + signatures on-chain")
    .requiredOption("--proposal <path>")
    .option("--rpc <url>")
    .option("--key-file <path>", "deployer key (must hold ETH for gas)")
    .option("--key-env <name>")
    .option("--data-dir <dir>")
    .action(async (opts) => {
      const rpc = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
      const provider = new JsonRpcProvider(rpc);
      const pk = opts.keyFile ? fs.readFileSync(opts.keyFile, "utf8").trim()
              : opts.keyEnv ? process.env[opts.keyEnv]
              : process.env.DEPLOYER_PRIVATE_KEY;
      if (!pk) { err("provide --key-file/--key-env/DEPLOYER_PRIVATE_KEY"); process.exit(2); }
      const w = new EWallet(pk!, provider);
      const proposal = JSON.parse(fs.readFileSync(opts.proposal, "utf8"));
      const c = new Contract(proposal.contract, ABI, w);
      banner("MULTISIG EXECUTE");
      info(`contract: ${proposal.contract}`);
      info(`op:       ${JSON.stringify(proposal.op)}`);
      info(`signers:  ${(proposal.sigs ?? []).map((s: any) => s.signer).join(", ")}`);
      const sigs = (proposal.sigs ?? []).map((s: any) => s.sig);
      const tx = await (c.execute as (...args: unknown[]) => Promise<any>)(proposal.op, sigs);
      info(`broadcast: ${tx.hash}`);
      const r = await tx.wait();
      ok(`mined in block ${r?.blockNumber}`);
      // Audit
      const dataDir = resolveDataDir(opts.dataDir);
      try {
        const db = openDatabase(dataDir);
        new AuditLog(db).append("broadcast", {
          id: `multisig:${proposal.digest}`,
          tx_hash: tx.hash,
          value: proposal.op.value,
          via: "multisig",
        });
        db.close();
      } catch { /* audit best-effort */ }
    });

  ms.command("status")
    .description("Show on-chain multisig state")
    .requiredOption("--contract <addr>")
    .option("--rpc <url>")
    .action(async (opts) => {
      const rpc = opts.rpc ?? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
      const provider = new JsonRpcProvider(rpc);
      const c = new Contract(opts.contract, ABI, provider);
      banner("MULTISIG STATUS");
      info(`contract: ${opts.contract}`);
      info(`signers:  ${(await (c.getSigners as (...args: unknown[]) => Promise<string[]>)()).join(", ")}`);
      info(`nonce:    ${await (c.nonce as (...args: unknown[]) => Promise<unknown>)()}`);
      info(`balance:  ${ethFromWei((await provider.getBalance(opts.contract)).toString())}`);
    });

  ms.command("deploy")
    .description("Hint: use packages/contracts. This subcommand prints the command.")
    .action(() => {
      info(`Use the contracts package:`);
      info(`  cd packages/contracts && MULTISIG_SIGNERS=<a,b,c> DEPLOYER_PRIVATE_KEY=0x... pnpm deploy:sepolia`);
    });
}
