import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptConnectionCredentials, decryptConnectionCredentials } from "./crypto";

const KEY = "test-encryption-key-for-unit-tests";

describe("crypto", () => {
  describe("encrypt / decrypt roundtrip", () => {
    it("returns original plaintext after roundtrip", () => {
      const plaintext = "sk-live-abc123secret";
      const ciphertext = encrypt(plaintext, KEY);
      expect(decrypt(ciphertext, KEY)).toBe(plaintext);
    });

    it("handles empty string", () => {
      const ciphertext = encrypt("", KEY);
      expect(decrypt(ciphertext, KEY)).toBe("");
    });

    it("handles unicode and multi-byte content", () => {
      const plaintext = "Schlüssel: 日本語テスト 🔑";
      const ciphertext = encrypt(plaintext, KEY);
      expect(decrypt(ciphertext, KEY)).toBe(plaintext);
    });
  });

  describe("ciphertext properties", () => {
    it("produces different ciphertexts for different plaintexts", () => {
      const a = encrypt("secret-a", KEY);
      const b = encrypt("secret-b", KEY);
      expect(a).not.toBe(b);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      const a = encrypt("same-secret", KEY);
      const b = encrypt("same-secret", KEY);
      expect(a).not.toBe(b);
    });

    it("output is a hex string", () => {
      const ciphertext = encrypt("test", KEY);
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("tamper detection", () => {
    it("throws when decrypting with the wrong key", () => {
      const ciphertext = encrypt("secret", KEY);
      expect(() => decrypt(ciphertext, "wrong-key")).toThrow();
    });

    it("throws when ciphertext is tampered with", () => {
      const ciphertext = encrypt("secret", KEY);
      const bytes = Buffer.from(ciphertext, "hex");
      bytes[bytes.length - 1] ^= 0xff;
      const tampered = bytes.toString("hex");
      expect(() => decrypt(tampered, KEY)).toThrow();
    });

    it("throws when auth tag is tampered with", () => {
      const ciphertext = encrypt("secret", KEY);
      const bytes = Buffer.from(ciphertext, "hex");
      // Auth tag starts at offset 12 (IV_LENGTH)
      bytes[12] ^= 0xff;
      const tampered = bytes.toString("hex");
      expect(() => decrypt(tampered, KEY)).toThrow();
    });
  });

  describe("encryptConnectionCredentials", () => {
    it("encrypts password and uri when key is provided", () => {
      const config = { host: "localhost", password: "secret", uri: "postgres://u:p@host/db" };
      const result = encryptConnectionCredentials(config, KEY);
      expect(result.host).toBe("localhost");
      expect(result.password).not.toBe("secret");
      expect(result.uri).not.toBe("postgres://u:p@host/db");
      expect(decrypt(result.password as string, KEY)).toBe("secret");
      expect(decrypt(result.uri as string, KEY)).toBe("postgres://u:p@host/db");
    });

    it("returns config unchanged when key is null", () => {
      const config = { host: "localhost", password: "secret" };
      const result = encryptConnectionCredentials(config, null);
      expect(result.password).toBe("secret");
    });

    it("skips empty password and uri", () => {
      const config = { host: "localhost", password: "", uri: "" };
      const result = encryptConnectionCredentials(config, KEY);
      expect(result.password).toBe("");
      expect(result.uri).toBe("");
    });

    it("does not mutate the original object", () => {
      const config = { password: "secret" };
      encryptConnectionCredentials(config, KEY);
      expect(config.password).toBe("secret");
    });
  });

  describe("decryptConnectionCredentials", () => {
    it("decrypts password and uri when key is provided", () => {
      const encrypted = encryptConnectionCredentials(
        { host: "localhost", password: "secret", uri: "postgres://u:p@host/db" },
        KEY,
      );
      const result = decryptConnectionCredentials(encrypted, KEY);
      expect(result.password).toBe("secret");
      expect(result.uri).toBe("postgres://u:p@host/db");
      expect(result.host).toBe("localhost");
    });

    it("returns config unchanged when key is null", () => {
      const config = { host: "localhost", password: "secret" };
      const result = decryptConnectionCredentials(config, null);
      expect(result.password).toBe("secret");
    });

    it("falls back to original value for plaintext passwords", () => {
      const config = { password: "already-plaintext" };
      const result = decryptConnectionCredentials(config, KEY);
      expect(result.password).toBe("already-plaintext");
    });

    it("falls back to original value for plaintext URIs", () => {
      const config = { uri: "postgres://u:p@host/db" };
      const result = decryptConnectionCredentials(config, KEY);
      expect(result.uri).toBe("postgres://u:p@host/db");
    });

    it("does not mutate the original object", () => {
      const encrypted = encryptConnectionCredentials({ password: "secret" }, KEY);
      const original = { ...encrypted };
      decryptConnectionCredentials(encrypted, KEY);
      expect(encrypted.password).toBe(original.password);
    });
  });
});
