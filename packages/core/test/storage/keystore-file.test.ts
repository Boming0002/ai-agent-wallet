import { describe, it, expect } from "vitest";
import { encryptKeystore, decryptKeystore } from "../../src/storage/keystore-file.js";

describe("keystore-file", () => {
  it("round-trips a payload", () => {
    const payload = Buffer.from("super-secret-share", "utf8");
    const enc = encryptKeystore(payload, "correct horse battery staple");
    const dec = decryptKeystore(enc, "correct horse battery staple");
    expect(dec.equals(payload)).toBe(true);
  });

  it("rejects wrong passphrase", () => {
    const enc = encryptKeystore(Buffer.from("x"), "right");
    expect(() => decryptKeystore(enc, "wrong")).toThrow();
  });

  it("uses different ciphertext for same payload (random nonce)", () => {
    const a = encryptKeystore(Buffer.from("x"), "p");
    const b = encryptKeystore(Buffer.from("x"), "p");
    expect(a.toString("hex")).not.toBe(b.toString("hex"));
  });
});
