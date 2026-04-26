// packages/core/src/keystore/shamir.ts
import * as secp from "@noble/secp256k1";
import { randomBytes } from "node:crypto";

const N = secp.CURVE.n;

function defaultRand(): bigint {
  const b = randomBytes(32);
  return BigInt("0x" + b.toString("hex"));
}

function randScalar(rand: () => bigint = defaultRand): bigint {
  // Rejection sample to avoid bias.
  for (;;) {
    const x = rand();
    if (x !== 0n && x < N) return x;
  }
}

export interface SharePair { share1: bigint; share2: bigint; }

export function split2of2(secret: bigint, rand: () => bigint = defaultRand): SharePair {
  if (secret <= 0n || secret >= N) throw new Error("secret out of range");
  // Additive 2-of-2 over Z/nZ: s1 random, s2 = secret - s1 (mod n).
  const s1 = randScalar(rand);
  const s2 = (secret - s1 + N) % N;
  return { share1: s1, share2: s2 };
}

export function combine2of2(s1: bigint, s2: bigint): bigint {
  return (s1 + s2) % N;
}
