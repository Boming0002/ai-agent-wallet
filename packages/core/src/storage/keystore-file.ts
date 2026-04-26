import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// File format (binary):
//   magic       (4)   "AIWK"
//   version     (1)   0x01
//   N_log2      (1)   17
//   r           (1)   8
//   p           (1)   1
//   salt        (16)
//   nonce       (12)
//   ciphertext+tag  (variable, AES-256-GCM, tag appended last 16 bytes)

const MAGIC = Buffer.from("AIWK", "ascii");
const VERSION = 0x01;
const N_LOG2 = 17;
const R = 8;
const P = 1;
const SALT_LEN = 16;
const NONCE_LEN = 12;
const TAG_LEN = 16;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 1 << N_LOG2, r: R, p: P, maxmem: 256 * 1024 * 1024 });
}

export function encryptKeystore(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from([VERSION, N_LOG2, R, P]);
  return Buffer.concat([MAGIC, header, salt, nonce, ct, tag]);
}

export function decryptKeystore(blob: Buffer, passphrase: string): Buffer {
  if (!blob.subarray(0, 4).equals(MAGIC)) throw new Error("bad magic");
  if (blob[4] !== VERSION) throw new Error("unsupported version");
  // header[5..7] are scrypt params; we trust the constants in v1
  const salt = blob.subarray(8, 8 + SALT_LEN);
  const nonce = blob.subarray(8 + SALT_LEN, 8 + SALT_LEN + NONCE_LEN);
  const tagStart = blob.length - TAG_LEN;
  const ct = blob.subarray(8 + SALT_LEN + NONCE_LEN, tagStart);
  const tag = blob.subarray(tagStart);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
