import type { ChainClient } from "../chain/client.js";
import type { EthAddress } from "../types.js";

export interface RecipientInfo { kind: "eoa" | "contract"; codeSize: number; }

export async function classifyRecipient(client: ChainClient, addr: EthAddress): Promise<RecipientInfo> {
  const code = await client.getCode(addr);
  const hex = code.startsWith("0x") ? code.slice(2) : code;
  const codeSize = hex.length / 2;
  return { kind: codeSize === 0 ? "eoa" : "contract", codeSize };
}
