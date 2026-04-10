import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateSafeUrl } from "./url-validation";
import * as dns from "node:dns/promises";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockLookup = dns.lookup as ReturnType<typeof vi.fn>;

describe("validateSafeUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("rejects non-HTTP protocols", async () => {
    expect(await validateSafeUrl("ftp://example.com")).toBe("Only HTTP(S) URLs are allowed");
    expect(await validateSafeUrl("file:///etc/passwd")).toBe("Only HTTP(S) URLs are allowed");
  });

  it("rejects invalid URLs", async () => {
    expect(await validateSafeUrl("not-a-url")).toBe("Invalid URL");
  });

  it("rejects private IPv4 addresses", async () => {
    expect(await validateSafeUrl("http://10.0.0.1/api")).toBe("URL resolves to a private/loopback address");
    expect(await validateSafeUrl("http://192.168.1.1/api")).toBe("URL resolves to a private/loopback address");
    expect(await validateSafeUrl("http://172.16.0.1/api")).toBe("URL resolves to a private/loopback address");
  });

  it("rejects loopback addresses", async () => {
    expect(await validateSafeUrl("http://127.0.0.1/api")).toBe("URL resolves to a private/loopback address");
    expect(await validateSafeUrl("http://127.0.0.2:8080/v1")).toBe("URL resolves to a private/loopback address");
  });

  it("rejects link-local / metadata IPs", async () => {
    expect(await validateSafeUrl("http://169.254.169.254/latest/meta-data/")).toBe(
      "URL resolves to a private/loopback address",
    );
  });

  it("allows valid public URLs", async () => {
    expect(await validateSafeUrl("https://api.openai.com/v1")).toBeNull();
  });

  it("rejects hostnames that resolve to private IPs (DNS rebinding)", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    expect(await validateSafeUrl("https://evil.example.com/v1")).toBe(
      "URL resolves to a private/loopback address",
    );
  });

  it("rejects unresolvable hostnames", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await validateSafeUrl("https://nonexistent.invalid/v1")).toBe("Could not resolve hostname");
  });

  it("rejects IPv6 loopback", async () => {
    expect(await validateSafeUrl("http://[::1]:8080/api")).toBe("URL resolves to a private/loopback address");
  });

  it("allows valid HTTPS URLs", async () => {
    expect(await validateSafeUrl("https://openrouter.ai/api/v1")).toBeNull();
  });
});
