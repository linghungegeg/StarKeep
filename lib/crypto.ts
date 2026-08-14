import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedValue = { encrypted: string; iv: string; tag: string };

function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  const result = Buffer.from(value, "base64");
  if (result.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return result;
}

export function encrypt(value: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { encrypted: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decrypt(value: EncryptedValue) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.encrypted, "base64")), decipher.final()]).toString("utf8");
}
