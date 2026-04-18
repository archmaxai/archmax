import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestApp, jsonBody } from "../test-utils/api-client";
import gitRoute from "./git";

const mockReinit = vi.fn();
const mockIsInitialized = vi.fn();
const mockEnsureRepo = vi.fn();
const mockLog = vi.fn();

vi.mock("../utils/params", () => ({
  param: vi.fn(() => "test-project"),
  getGitService: vi.fn(() => ({
    reinit: mockReinit,
    isInitialized: mockIsInitialized,
    ensureRepo: mockEnsureRepo,
    log: mockLog,
  })),
}));

const app = createTestApp("/api/projects/:projectId/git", gitRoute);

describe("POST /git/reinit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with initialized=true on success", async () => {
    mockReinit.mockResolvedValue(undefined);
    const res = await app.request("/api/projects/test-project/git/reinit", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ initialized: boolean; message: string }>(res);
    expect(body.initialized).toBe(true);
    expect(body.message).toContain("re-initialized");
    expect(mockReinit).toHaveBeenCalledOnce();
  });

  it("returns 500 when reinit throws", async () => {
    mockReinit.mockRejectedValue(new Error("fs error"));
    const res = await app.request("/api/projects/test-project/git/reinit", {
      method: "POST",
    });
    expect(res.status).toBe(500);
  });
});

describe("GET /git/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initialized=true when repo exists", async () => {
    mockIsInitialized.mockResolvedValue(true);
    const res = await app.request("/api/projects/test-project/git/status", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ initialized: boolean }>(res);
    expect(body.initialized).toBe(true);
  });

  it("returns initialized=false when repo does not exist", async () => {
    mockIsInitialized.mockResolvedValue(false);
    const res = await app.request("/api/projects/test-project/git/status", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ initialized: boolean }>(res);
    expect(body.initialized).toBe(false);
  });
});

describe("POST /git/init", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initialized=true when repo is created", async () => {
    mockEnsureRepo.mockResolvedValue({ created: true });
    const res = await app.request("/api/projects/test-project/git/init", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ initialized: boolean; message: string }>(res);
    expect(body.initialized).toBe(true);
    expect(body.message).toContain("initialized");
  });

  it("returns already initialized message on second call", async () => {
    mockEnsureRepo.mockResolvedValue({ created: false });
    const res = await app.request("/api/projects/test-project/git/init", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ initialized: boolean; message: string }>(res);
    expect(body.initialized).toBe(true);
    expect(body.message).toContain("already");
  });
});

describe("GET /git/log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns log entries", async () => {
    const entries = [
      { oid: "abc123", message: "test commit", author: { name: "archmax", email: "archmax@localhost" }, timestamp: "2025-01-01T00:00:00Z" },
    ];
    mockLog.mockResolvedValue(entries);
    const res = await app.request("/api/projects/test-project/git/log", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<typeof entries>(res);
    expect(body).toHaveLength(1);
    expect(body[0].message).toBe("test commit");
  });

  it("respects the limit query parameter", async () => {
    mockLog.mockResolvedValue([]);
    await app.request("/api/projects/test-project/git/log?limit=5", {
      method: "GET",
    });
    expect(mockLog).toHaveBeenCalledWith(5);
  });

  it("caps limit at 100", async () => {
    mockLog.mockResolvedValue([]);
    await app.request("/api/projects/test-project/git/log?limit=999", {
      method: "GET",
    });
    expect(mockLog).toHaveBeenCalledWith(100);
  });
});
