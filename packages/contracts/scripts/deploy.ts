// packages/contracts/scripts/deploy.ts
import hre from "hardhat";

async function main() {
  const signersEnv = process.env.MULTISIG_SIGNERS;
  if (!signersEnv) throw new Error("set MULTISIG_SIGNERS=addr1,addr2,addr3");
  const signers = signersEnv.split(",").map((s) => s.trim()) as [string, string, string];
  if (signers.length !== 3) throw new Error("need exactly 3 signers");

  const ms = await hre.viem.deployContract("AIAgentMultisig", [signers]);
  console.log(JSON.stringify({
    address: ms.address,
    signers,
    network: hre.network.name,
    deployTx: ms.deploymentTransaction?.hash ?? null,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
