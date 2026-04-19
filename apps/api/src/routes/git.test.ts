import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestApp, jsonBody } from "../test-utils/api-client";
import gitRoute from "./git";

const mockReinit = vi.fn();
const mockIsInitialized = vi.fn();
const mockEnsureRepo = vi.fn();
const mockLog = vi.fn();
const mockRevertToCommit = vi.fn();
const mockFinalizePublish = vi.fn();

vi.mock("../utils/params", () => ({
  param: vi.fn(() => "test-project"),
  getGitService: vi.fn(() => ({
    reinit: mockReinit,
    isInitialized: mockIsInitialized,
    ensureRepo: mockEnsureRepo,
    log: mockLog,
    revertToCommit: mockRevertToCommit,
  })),
}));

vi.mock("../utils/publish-flow", () => ({
  finalizePublish: (...args: unknown[]) => mockFinalizePublish(...args),
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

  it("returns paginated log entries", async () => {
    const entry = { oid: "abc123", message: "test commit", author: { name: "archmax", email: "archmax@localhost" }, timestamp: "2025-01-01T00:00:00Z" };
    mockLog.mockResolvedValue({ entries: [entry], total: 1, page: 1, limit: 10 });
    const res = await app.request("/api/projects/test-project/git/log", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ entries: typeof entry[]; total: number; page: number; limit: number }>(res);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].message).toBe("test commit");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
  });

  it("respects the limit and page query parameters", async () => {
    mockLog.mockResolvedValue({ entries: [], total: 0, page: 2, limit: 5 });
    await app.request("/api/projects/test-project/git/log?limit=5&page=2", {
      method: "GET",
    });
    expect(mockLog).toHaveBeenCalledWith({ limit: 5, page: 2 });
  });

  it("caps limit at 100", async () => {
    mockLog.mockResolvedValue({ entries: [], total: 0, page: 1, limit: 100 });
    await app.request("/api/projects/test-project/git/log?limit=999", {
      method: "GET",
    });
    expect(mockLog).toHaveBeenCalledWith({ limit: 100, page: 1 });
  });
});

describe("POST /git/revert-to-commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns revert result on success", async () => {
    mockRevertToCommit.mockResolvedValue({ message: "Revert to: v1" });
    mockFinalizePublish.mockResolvedValue({ oid: "buildoid", event: {}, modelNames: [], contentHash: "" });
    const res = await app.request("/api/projects/test-project/git/revert-to-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oid: "abc123" }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ oid: string; message: string }>(res);
    expect(body.oid).toBe("buildoid");
    expect(body.message).toBe("Revert to: v1");
    expect(mockRevertToCommit).toHaveBeenCalledWith("abc123");
    expect(mockFinalizePublish).toHaveBeenCalledWith(
      "test-project",
      expect.any(Object),
      { publishMessage: "Revert to: v1" },
    );
  });

  it("surfaces pushWarning from finalizePublish", async () => {
    mockRevertToCommit.mockResolvedValue({ message: "Revert to: v1" });
    mockFinalizePublish.mockResolvedValue({
      oid: "buildoid",
      event: {},
      modelNames: [],
      contentHash: "",
      pushWarning: "push rejected",
    });
    const res = await app.request("/api/projects/test-project/git/revert-to-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oid: "abc123" }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ oid: string; message: string; pushWarning?: string }>(res);
    expect(body.pushWarning).toBe("push rejected");
  });

  it("returns already-at-version when result is null", async () => {
    mockRevertToCommit.mockResolvedValue(null);
    const res = await app.request("/api/projects/test-project/git/revert-to-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oid: "abc123" }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ oid: string; message: string }>(res);
    expect(body.message).toBe("Already at this version");
  });

  it("returns 400 for missing oid", async () => {
    const res = await app.request("/api/projects/test-project/git/revert-to-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when commit not found", async () => {
    mockRevertToCommit.mockRejectedValue(new Error("Commit deadbeef not found"));
    const res = await app.request("/api/projects/test-project/git/revert-to-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oid: "deadbeef" }),
    });
    expect(res.status).toBe(400);
  });
});
