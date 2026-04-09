import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";

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
});
