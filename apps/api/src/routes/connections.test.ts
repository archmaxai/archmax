import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  redactConnectionConfig,
  mergeConnectionConfig,
  redactConnectionErrorMessage,
  REDACTED_SENTINEL,
} from "./connections";

vi.mock("@archmax/core/config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "" })),
}));

vi.mock("@archmax/core/infra/crypto", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@archmax/core/infra/crypto")>();
  return {
    ...orig,
    encryptConnectionCredentials: vi.fn(orig.encryptConnectionCredentials),
    decryptConnectionCredentials: vi.fn(orig.decryptConnectionCredentials),
  };
});

import { getEnv } from "@archmax/core/config/env";

const mockGetEnv = vi.mocked(getEnv);

describe("redactConnectionConfig", () => {
  beforeEach(() => {
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: "" } as ReturnType<typeof getEnv>);
  });

  it("redacts password field", () => {
    const config = { host: "localhost", port: 5432, password: "supersecret" };
    const result = redactConnectionConfig(config);
    expect(result.password).toBe("********");
    expect(result.host).toBe("localhost");
    expect(result.port).toBe(5432);
  });

  it("does not add password field if not present", () => {
    const config = { host: "localhost" };
    const result = redactConnectionConfig(config);
    expect(result.password).toBeUndefined();
  });

  it("does not redact empty password", () => {
    const config = { host: "localhost", password: "" };
    const result = redactConnectionConfig(config);
    expect(result.password).toBe("");
  });

  it("redacts credentials in URI", () => {
    const config = { uri: "postgresql://admin:secret123@db.example.com:5432/mydb" };
    const result = redactConnectionConfig(config);
    expect(result.uri).not.toContain("secret123");
    expect(result.uri).toContain("db.example.com");
  });

  it("leaves URI without password untouched", () => {
    const config = { uri: "postgresql://db.example.com:5432/mydb" };
    const result = redactConnectionConfig(config);
    expect(result.uri).toBe("postgresql://db.example.com:5432/mydb");
  });

  it("leaves non-URL URI strings untouched", () => {
    const config = { uri: "not-a-url" };
    const result = redactConnectionConfig(config);
    expect(result.uri).toBe("not-a-url");
  });

  it("does not mutate the original object", () => {
    const config = { password: "secret", host: "localhost" };
    redactConnectionConfig(config);
    expect(config.password).toBe("secret");
  });

  it("handles config with both password and URI credentials", () => {
    const config = {
      password: "secret",
      uri: "postgresql://user:mypass@host/db",
    };
    const result = redactConnectionConfig(config);
    expect(result.password).toBe("********");
    expect(result.uri).not.toContain("mypass");
  });

  it("handles MongoDB connection string format", () => {
    const config = { uri: "mongodb+srv://admin:p%40ssw0rd@cluster.mongodb.net/mydb" };
    const result = redactConnectionConfig(config);
    expect(result.uri).not.toContain("p%40ssw0rd");
    expect(result.uri).toContain("cluster.mongodb.net");
  });

  it("decrypts encrypted password before redacting", () => {
    const { encrypt } = require("@archmax/core/infra/crypto");
    const key = "test-key-for-redact";
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: key } as ReturnType<typeof getEnv>);
    const encrypted = encrypt("supersecret", key);
    const config = { host: "localhost", password: encrypted };
    const result = redactConnectionConfig(config);
    expect(result.password).toBe("********");
  });
});

describe("mergeConnectionConfig", () => {
  beforeEach(() => {
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: "" } as ReturnType<typeof getEnv>);
  });

  it("preserves stored password when incoming is sentinel", () => {
    const incoming = { host: "localhost", password: REDACTED_SENTINEL };
    const stored = { host: "localhost", password: "realpass" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.password).toBe("realpass");
  });

  it("preserves stored password when incoming is empty string", () => {
    const incoming = { host: "localhost", password: "" };
    const stored = { host: "localhost", password: "realpass" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.password).toBe("realpass");
  });

  it("preserves stored password when incoming omits password", () => {
    const incoming = { host: "newhost" };
    const stored = { host: "localhost", password: "realpass" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.password).toBe("realpass");
  });

  it("uses new password when incoming is a real value (no encryption key)", () => {
    const incoming = { host: "localhost", password: "newpass" };
    const stored = { host: "localhost", password: "oldpass" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.password).toBe("newpass");
  });

  it("removes password field when incoming and stored are both empty", () => {
    const incoming = { host: "localhost", password: "" };
    const stored = { host: "localhost" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.password).toBeUndefined();
  });

  it("preserves stored URI when incoming URI contains sentinel password", () => {
    const redacted = redactConnectionConfig({ uri: "postgresql://admin:secret@db.example.com:5432/mydb" });
    const incoming = { uri: redacted.uri as string };
    const stored = { uri: "postgresql://admin:secret@db.example.com:5432/mydb" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.uri).toBe("postgresql://admin:secret@db.example.com:5432/mydb");
  });

  it("uses new URI when incoming URI has a real password (no encryption key)", () => {
    const incoming = { uri: "postgresql://admin:newpass@db.example.com:5432/mydb" };
    const stored = { uri: "postgresql://admin:oldpass@db.example.com:5432/mydb" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.uri).toBe("postgresql://admin:newpass@db.example.com:5432/mydb");
  });

  it("leaves non-URL URI strings unchanged", () => {
    const incoming = { uri: "not-a-url" };
    const stored = { uri: "also-not-a-url" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.uri).toBe("not-a-url");
  });

  it("does not mutate the original objects", () => {
    const incoming = { password: REDACTED_SENTINEL, host: "localhost" };
    const stored = { password: "realpass", host: "localhost" };
    mergeConnectionConfig(incoming, stored);
    expect(incoming.password).toBe(REDACTED_SENTINEL);
    expect(stored.password).toBe("realpass");
  });

  it("merges both password and URI credentials together", () => {
    const redacted = redactConnectionConfig({
      password: "secret",
      uri: "postgresql://user:mypass@host/db",
    });
    const incoming = { password: REDACTED_SENTINEL, uri: redacted.uri as string };
    const stored = { password: "secret", uri: "postgresql://user:mypass@host/db" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.password).toBe("secret");
    expect(result.uri).toBe("postgresql://user:mypass@host/db");
  });

  it("encrypts new password when ENCRYPTION_KEY is set", () => {
    const { encrypt, decrypt } = require("@archmax/core/infra/crypto");
    const key = "test-key-for-merge";
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: key } as ReturnType<typeof getEnv>);
    const incoming = { host: "localhost", password: "newpass" };
    const stored = { host: "localhost", password: "oldpass" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.password).not.toBe("newpass");
    expect(decrypt(result.password as string, key)).toBe("newpass");
  });

  it("encrypts new URI when ENCRYPTION_KEY is set", () => {
    const { decrypt } = require("@archmax/core/infra/crypto");
    const key = "test-key-for-merge-uri";
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: key } as ReturnType<typeof getEnv>);
    const incoming = { uri: "postgresql://admin:newpass@host/db" };
    const stored = { uri: "postgresql://admin:oldpass@host/db" };
    const result = mergeConnectionConfig(incoming, stored);
    expect(result.uri).not.toBe("postgresql://admin:newpass@host/db");
    expect(decrypt(result.uri as string, key)).toBe("postgresql://admin:newpass@host/db");
  });
});

describe("redactConnectionErrorMessage", () => {
  // Driver/DuckDB errors echo raw connection strings into their messages
  // (e.g. an iceberg ATTACH failure that includes the full DSN, or a
  // libpq error that contains `password=...`). The route never returns
  // these verbatim to the API caller, but we still log a sanitized copy
  // server-side for ops debugging — the redactor below ensures secrets
  // never reach disk-resident logs.

  it("redacts URI-style password between user: and @host", () => {
    const out = redactConnectionErrorMessage(
      "ATTACH failed: connection to postgresql://admin:supersecret@db.example.com:5432/mydb refused",
    );
    expect(out).not.toContain("supersecret");
    expect(out).toContain("***:***@db.example.com");
  });

  it("redacts MongoDB-style URIs with url-encoded passwords", () => {
    const out = redactConnectionErrorMessage(
      "Error: cannot connect to mongodb+srv://admin:p%40ssw0rd@cluster.mongodb.net/mydb",
    );
    expect(out).not.toContain("p%40ssw0rd");
    expect(out).toContain("***:***@cluster.mongodb.net");
  });

  it.each([
    ["password=supersecret", "password"],
    ["Password=supersecret", "Password"],
    ["pwd=supersecret", "pwd"],
    ["token=supersecret", "token"],
    ["client_secret=supersecret", "client_secret"],
    ["clientSecret=supersecret", "clientSecret"],
    ["api_key=supersecret", "api_key"],
    ["api-key=supersecret", "api-key"],
    ["secret=supersecret", "secret"],
  ])("redacts DSN-style credential pair %s", (pair, key) => {
    const msg = `connection failed: host=db.example.com ${pair};database=mydb`;
    const out = redactConnectionErrorMessage(msg);
    expect(out).not.toContain("supersecret");
    expect(out).toContain(`${key}=********`);
    expect(out).toContain("host=db.example.com");
  });

  it("preserves non-credential parts of the message", () => {
    const out = redactConnectionErrorMessage(
      "IO Error: connection refused at db.example.com:5432",
    );
    expect(out).toBe("IO Error: connection refused at db.example.com:5432");
  });

  it("redacts both URI and DSN credentials in the same message", () => {
    const out = redactConnectionErrorMessage(
      "ATTACH error: postgresql://u:p1@h/d failed; password=p2 unusable",
    );
    expect(out).not.toContain("p1");
    expect(out).not.toContain("p2");
    expect(out).toContain("***:***@h/d");
    expect(out).toContain("password=********");
  });

  it("does not match arbitrary 'token' words inside other identifiers", () => {
    // The denylist is anchored on `<key>=<value>` not bare words; a
    // word like `tokenized` should pass through unchanged.
    const out = redactConnectionErrorMessage("Error: tokenized response invalid");
    expect(out).toBe("Error: tokenized response invalid");
  });
});
