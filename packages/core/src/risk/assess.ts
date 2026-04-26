import type { ChainClient } from "../chain/client.js";
import type { ProposedTx, RiskReport, EthAddress } from "../types.js";
import { classifyRecipient } from "./recipient.js";
import { isErc20MethodCall, probeErc20 } from "./erc20.js";
import { simulate } from "../chain/simulate.js";

const SMALL_BYTECODE_CUTOFF = 100;

export async function assessRisk(client: ChainClient, tx: ProposedTx, from: EthAddress): Promise<RiskReport> {
  const recipient = await classifyRecipient(client, tx.to);
  const flags: RiskReport["flags"] = [];

  if (recipient.kind === "contract" && recipient.codeSize < SMALL_BYTECODE_CUTOFF) {
    flags.push("proxy_or_minimal");
  }

  let erc20: RiskReport["erc20"];
  if (recipient.kind === "contract" && isErc20MethodCall(tx.data)) {
    const probe = await probeErc20(client, tx.to, tx.data);
    erc20 = probe;
    if (!probe.ok) flags.push("suspicious_token");
  }

  const sim = await simulate(client, tx, from);
  if (sim.ok) {
    const used = BigInt(sim.gasUsed);
    if (tx.data === "0x" && used > 32000n) flags.push("gas_anomaly");
  }

  return {
    recipient,
    erc20,
    simulation: sim.ok
      ? { ok: true, gasUsed: sim.gasUsed }
      : { ok: false, revertReason: sim.revertReason },
    flags,
  };
}
