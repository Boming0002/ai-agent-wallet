// packages/core/src/audit/hash-chain.ts
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { Hex } from "../types.js";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

export function chainHash(prevHash: Hex, kind: string, ts: number, payload: unknown): Hex {
  const input = `${prevHash}|${kind}|${ts}|${canonicalJson(payload)}`;
  return ("0x" + bytesToHex(sha256(new TextEncoder().encode(input)))) as Hex;
}

export const ZERO_HASH: Hex = ("0x" + "0".repeat(64)) as Hex;
