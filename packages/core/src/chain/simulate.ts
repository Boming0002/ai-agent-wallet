import type { ChainClient } from "./client.js";
import type { ProposedTx, EthAddress } from "../types.js";

export type SimResult = { ok: true; gasUsed: string } | { ok: false; revertReason: string };

function decodeRevert(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "execution reverted";
  const data = (err as { data?: string })?.data;
  if (!data || typeof data !== "string") return msg;
  // Error(string) selector = 0x08c379a0
  if (data.startsWith("0x08c379a0") && data.length >= 138) {
    try {
      const hex = data.slice(138);
      const bytes = Buffer.from(hex, "hex");
      const end = bytes.indexOf(0);
      return bytes.subarray(0, end >= 0 ? end : bytes.length).toString("utf8") || msg;
    } catch { return msg; }
  }
  return msg;
}

export async function simulate(client: ChainClient, tx: ProposedTx, from: EthAddress): Promise<SimResult> {
  try {
    await client.call({ to: tx.to, data: tx.data });
    const gas = await client.estimateGas({
      to: tx.to, data: tx.data, value: BigInt(tx.value), from,
    });
    return { ok: true, gasUsed: gas.toString() };
  } catch (e) {
    return { ok: false, revertReason: decodeRevert(e) };
  }
}
