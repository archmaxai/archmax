import { describe, it, expect } from "vitest";
import { redactConnectionConfig, mergeConnectionConfig, REDACTED_SENTINEL } from "./connections";

describe("redactConnectionConfig", () => {
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
});

describe("mergeConnectionConfig", () => {
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

  it("uses new password when incoming is a real value", () => {
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

  it("uses new URI when incoming URI has a real password", () => {
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
});
