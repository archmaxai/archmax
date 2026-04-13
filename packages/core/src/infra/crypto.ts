import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a hex string: iv + authTag + ciphertext.
 */
export function encrypt(plaintext: string, key: string): string {
  const derivedKey = deriveKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

/**
 * Decrypt a hex string produced by encrypt().
 */
export function decrypt(ciphertext: string, key: string): string {
  const derivedKey = deriveKey(key);
  const buf = Buffer.from(ciphertext, "hex");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf-8");
}

/**
 * Try to decrypt a value; return the original string if decryption fails
 * (assumes the value is already plaintext).
 */
function tryDecrypt(value: string, key: string): string {
  try {
    return decrypt(value, key);
  } catch {
    return value;
  }
}

/**
 * Encrypt sensitive fields (password, uri) in a connection config object.
 * Returns a shallow copy with encrypted values. No-op when key is null.
 */
const SENSITIVE_FIELDS = ["password", "uri", "token", "clientSecret"] as const;

export function encryptConnectionCredentials(
  config: Record<string, unknown>,
  key: string | null,
): Record<string, unknown> {
  if (!key) return config;
  const result = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (typeof result[field] === "string" && result[field]) {
      result[field] = encrypt(result[field] as string, key);
    }
  }
  return result;
}

/**
 * Decrypt sensitive fields (password, uri) in a connection config object.
 * Falls back to the original value if decryption fails (plaintext data).
 * No-op when key is null.
 */
export function decryptConnectionCredentials(
  config: Record<string, unknown>,
  key: string | null,
): Record<string, unknown> {
  if (!key) return config;
  const result = { ...config };
  for (const field of SENSITIVE_FIELDS) {
    if (typeof result[field] === "string" && result[field]) {
      result[field] = tryDecrypt(result[field] as string, key);
    }
  }
  return result;
}
