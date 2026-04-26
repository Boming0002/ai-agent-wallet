// packages/core/src/keystore/keystore.ts
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "node:crypto";
import { split2of2, combine2of2 } from "./shamir.js";
import { addressFromPrivateKey } from "./address.js";
import type { EthAddress, Hex } from "../types.js";

// @noble/secp256k1 v2 requires hmacSha256Sync to be configured for synchronous signing.
secp.etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) =>
  hmac(sha256, key, secp.etc.concatBytes(...msgs));

export interface Wallet {
  address: EthAddress;
  shareAgent: Hex;
  shareOwner: Hex;
}

export interface Signature { r: Hex; s: Hex; v: 27 | 28; }

function bigintToHex32(x: bigint): Hex {
  return ("0x" + x.toString(16).padStart(64, "0")) as Hex;
}

function hexToBigint(h: string): bigint {
  return BigInt(h.startsWith("0x") ? h : "0x" + h);
}

export function generateWallet(): Wallet {
  // Sample a private key d in [1, n-1].
  let d: bigint;
  do {
    const b = randomBytes(32);
    d = BigInt("0x" + b.toString("hex"));
  } while (d === 0n || d >= secp.CURVE.n);
  const { share1, share2 } = split2of2(d);
  const address = addressFromPrivateKey(d);
  // Zero d immediately by overwriting our local var; JS GC takes care of the rest.
  d = 0n;
  return {
    address,
    shareAgent: bigintToHex32(share1),
    shareOwner: bigintToHex32(share2),
  };
}

export function addressFromShares(shareAgent: string, shareOwner: string): EthAddress {
  const d = combine2of2(hexToBigint(shareAgent), hexToBigint(shareOwner));
  if (d === 0n || d >= secp.CURVE.n) throw new Error("invalid combined share");
  return addressFromPrivateKey(d);
}

export function signWithShares(shareAgent: string, shareOwner: string, msgHash: Uint8Array): Signature {
  const d = combine2of2(hexToBigint(shareAgent), hexToBigint(shareOwner));
  if (d === 0n || d >= secp.CURVE.n) throw new Error("invalid combined share");
  const dHex = d.toString(16).padStart(64, "0");
  // sign() in @noble/secp256k1 v2 returns RecoveredSignature, which has r, s, and recovery.
  const sig = secp.sign(msgHash, dHex, { lowS: true });
  // sig.recovery is 0 or 1; Ethereum uses v = 27 + recovery.
  const v = (27 + sig.recovery) as 27 | 28;
  return {
    r: ("0x" + sig.r.toString(16).padStart(64, "0")) as Hex,
    s: ("0x" + sig.s.toString(16).padStart(64, "0")) as Hex,
    v,
  };
}
