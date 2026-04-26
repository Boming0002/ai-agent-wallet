import type { ChainClient } from "../chain/client.js";
import type { EthAddress, Hex } from "../types.js";

const TRANSFER_SEL = "0xa9059cbb";
const TRANSFER_FROM_SEL = "0x23b872dd";
const APPROVE_SEL = "0x095ea7b3";

const NAME_SEL = "0x06fdde03";
const SYMBOL_SEL = "0x95d89b41";
const DECIMALS_SEL = "0x313ce567";

export function isErc20MethodCall(data: string): boolean {
  if (!data || data.length < 10) return false;
  const sel = data.slice(0, 10).toLowerCase();
  return sel === TRANSFER_SEL || sel === TRANSFER_FROM_SEL || sel === APPROVE_SEL;
}

function decodeStringResult(hex: string): string | null {
  // ABI-encoded string: offset(32 bytes) | length(32 bytes) | data
  if (!hex.startsWith("0x") || hex.length < 2 + 64 * 2) return null;
  const lenHex = hex.slice(2 + 64, 2 + 64 + 64);
  const len = parseInt(lenHex, 16);
  if (len === 0 || len > 256) return null;
  const dataStart = 2 + 64 * 2;
  const bytes = hex.slice(dataStart, dataStart + len * 2);
  try { return Buffer.from(bytes, "hex").toString("utf8"); } catch { return null; }
}

function decodeUint8(hex: string): number | null {
  if (!hex.startsWith("0x") || hex.length < 66) return null;
  return parseInt(hex.slice(2, 66), 16);
}

function decodeUint256(hex: string): bigint | null {
  if (!hex.startsWith("0x") || hex.length < 66) return null;
  try { return BigInt("0x" + hex.slice(2, 66)); } catch { return null; }
}

export interface Erc20Probe {
  ok: true; name: string; symbol: string; decimals: number; amountHuman: string;
}

export interface Erc20Failure { ok: false; reason: string; }

export async function probeErc20(
  client: ChainClient, token: EthAddress, transferData: Hex,
): Promise<Erc20Probe | Erc20Failure> {
  try {
    const [nameHex, symbolHex, decimalsHex] = await Promise.all([
      client.call({ to: token, data: NAME_SEL as Hex }),
      client.call({ to: token, data: SYMBOL_SEL as Hex }),
      client.call({ to: token, data: DECIMALS_SEL as Hex }),
    ]);
    const name = decodeStringResult(nameHex);
    const symbol = decodeStringResult(symbolHex);
    const decimals = decodeUint8(decimalsHex);
    if (!name || !symbol || decimals === null) {
      return { ok: false, reason: "non-conformant ERC-20 metadata" };
    }
    // Decode amount from transferData (selector + 32 bytes addr + 32 bytes amount)
    let amountHuman = "0";
    if (transferData.length >= 10 + 64 + 64) {
      const amtHex = "0x" + transferData.slice(10 + 64);
      const amt = decodeUint256(amtHex);
      if (amt !== null) {
        const denom = 10n ** BigInt(decimals);
        const whole = amt / denom;
        const frac = amt % denom;
        amountHuman = frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(decimals, "0")}`;
      }
    }
    return { ok: true, name, symbol, decimals, amountHuman };
  } catch (e) {
    return { ok: false, reason: (e as Error).message ?? "probe failed" };
  }
}
