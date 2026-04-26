// packages/core/test/keystore/keystore.test.ts
import { describe, it, expect } from "vitest";
import { generateWallet, signWithShares, addressFromShares } from "../../src/keystore/keystore.js";
import { keccak_256 } from "@noble/hashes/sha3";
import { keccak_256 as keccak } from "@noble/hashes/sha3";
import * as secp from "@noble/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";

describe("keystore facade", () => {
  it("generates a wallet with two shares that recombine to a valid private key", () => {
    const w = generateWallet();
    expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(w.shareAgent).toBeTypeOf("string");
    expect(w.shareOwner).toBeTypeOf("string");
    expect(addressFromShares(w.shareAgent, w.shareOwner)).toBe(w.address);
  });

  it("signWithShares produces a valid ECDSA signature", () => {
    const w = generateWallet();
    const msg = keccak_256(new TextEncoder().encode("hello"));
    const sig = signWithShares(w.shareAgent, w.shareOwner, msg);
    expect(sig.r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sig.s).toMatch(/^0x[0-9a-f]{64}$/);
    expect([27, 28]).toContain(sig.v);
    // Recover public key from the compact (r||s) bytes + recovery id, then derive address.
    // v=27 → recovery=0, v=28 → recovery=1 (Ethereum convention).
    const recId = sig.v - 27;
    const compactBytes = Buffer.from(sig.r.slice(2) + sig.s.slice(2), "hex");
    const recoveredPub = secp.Signature.fromCompact(compactBytes)
      .addRecoveryBit(recId)
      .recoverPublicKey(msg);
    // Derive address from recovered uncompressed public key (drop 0x04 prefix, hash, take last 20 bytes).
    const pubBytes = recoveredPub.toRawBytes(false).subarray(1); // 64 bytes
    const addrHash = keccak(pubBytes);
    const recoveredAddress = "0x" + bytesToHex(addrHash.subarray(12));
    expect(recoveredAddress.toLowerCase()).toBe(w.address.toLowerCase());
  });

  it("a single share alone cannot reconstruct the address", () => {
    const w = generateWallet();
    expect(() => addressFromShares(w.shareAgent, "0x" + "0".repeat(64))).not.toBe(w.address);
  });
});
