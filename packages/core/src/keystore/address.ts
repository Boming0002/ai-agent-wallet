// packages/core/src/keystore/address.ts
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import type { EthAddress } from "../types.js";

const N = secp.CURVE.n;

export function addressFromPrivateKey(d: bigint): EthAddress {
  if (d <= 0n || d >= N) throw new Error("private key out of range");
  const dBytes = d.toString(16).padStart(64, "0");
  const pubUncompressed = secp.getPublicKey(dBytes, false); // 65 bytes, leading 0x04
  const pub = pubUncompressed.subarray(1); // 64 bytes
  const hash = keccak_256(pub);
  const addr = "0x" + bytesToHex(hash.subarray(12));
  return addr as EthAddress;
}
