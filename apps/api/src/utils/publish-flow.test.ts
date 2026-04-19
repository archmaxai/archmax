import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAssemble = vi.fn();
const mockComputeSourceHash = vi.fn();
const mockInvalidateScopedViews = vi.fn();
const mockConnectDB = vi.fn();
const mockGetRemoteConfig = vi.fn();
const mockPublishEventSave = vi.fn();
const mockPublishEventCtor = vi.fn();

vi.mock("@archmax/core/config/env", () => ({
  getEnv: () => ({ projectsDir: "/tmp/projects" }),
}));

vi.mock("@archmax/core/services/publish", () => {
  class PublishService {
    assemble = mockAssemble;
    computeSourceHash = mockComputeSourceHash;
  }
  return { PublishService };
});

vi.mock("@archmax/core/services/duckdb", () => ({
  invalidateScopedViews: (...args: unknown[]) => mockInvalidateScopedViews(...args),
}));

vi.mock("@archmax/core/infra/db", () => ({
  connectDB: (...args: unknown[]) => mockConnectDB(...args),
}));

vi.mock("@archmax/core/models/index", () => {
  class PublishEvent {
    constructor(doc: Record<string, unknown>) {
      mockPublishEventCtor(doc);
      Object.assign(this, doc);
    }
    save = mockPublishEventSave;
  }
  return { PublishEvent };
});

vi.mock("./github", () => ({
  getRemoteConfig: (...args: unknown[]) => mockGetRemoteConfig(...args),
}));

import { finalizePublish } from "./publish-flow";

function makeGitSvc(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    commit: overrides.commit ?? vi.fn().mockResolvedValue("new-commit-oid"),
    push: overrides.push ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof finalizePublish>[1];
}

describe("finalizePublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssemble.mockResolvedValue(["model-a", "model-b"]);
    mockComputeSourceHash.mockResolvedValue("hash-abc");
    mockPublishEventSave.mockResolvedValue(undefined);
  });

  it("assembles, commits, records a PublishEvent, and returns the commit oid", async () => {
    mockGetRemoteConfig.mockResolvedValue(null);
    const gitSvc = makeGitSvc();

    const result = await finalizePublish("proj-1", gitSvc, { publishMessage: "ship it" });

    expect(mockAssemble).toHaveBeenCalledWith("proj-1");
    expect(mockComputeSourceHash).toHaveBeenCalledWith("proj-1");
    expect(mockInvalidateScopedViews).toHaveBeenCalledWith("proj-1");
    expect(gitSvc.commit).toHaveBeenCalledWith("ship it");
    expect(mockConnectDB).toHaveBeenCalled();
    expect(mockPublishEventCtor).toHaveBeenCalledWith({
      project: "proj-1",
      message: "ship it",
      modelNames: ["model-a", "model-b"],
      contentHash: "hash-abc",
    });
    expect(mockPublishEventSave).toHaveBeenCalledOnce();
    expect(result.oid).toBe("new-commit-oid");
    expect(result.modelNames).toEqual(["model-a", "model-b"]);
    expect(result.contentHash).toBe("hash-abc");
    expect(result.pushWarning).toBeUndefined();
  });

  it("uses commitMessage override when provided, without affecting the PublishEvent message", async () => {
    mockGetRemoteConfig.mockResolvedValue(null);
    const gitSvc = makeGitSvc();

    await finalizePublish("proj-1", gitSvc, {
      publishMessage: "Revert to: initial",
      commitMessage: "Build: Revert to: initial",
    });

    expect(gitSvc.commit).toHaveBeenCalledWith("Build: Revert to: initial");
    expect(mockPublishEventCtor).toHaveBeenCalledWith(expect.objectContaining({ message: "Revert to: initial" }));
  });

  it("pushes to the remote when one is configured", async () => {
    const remote = { url: "https://github.com/x/y.git", branch: "main", token: "t" };
    mockGetRemoteConfig.mockResolvedValue(remote);
    const gitSvc = makeGitSvc();

    const result = await finalizePublish("proj-1", gitSvc, { publishMessage: "m" });

    expect(gitSvc.push).toHaveBeenCalledWith(remote);
    expect(result.pushWarning).toBeUndefined();
  });

  it("surfaces pushWarning when push fails but still records the PublishEvent", async () => {
    mockGetRemoteConfig.mockResolvedValue({ url: "u", branch: "main", token: "t" });
    const gitSvc = makeGitSvc({
      push: vi.fn().mockRejectedValue(new Error("401 Unauthorized")),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await finalizePublish("proj-1", gitSvc, { publishMessage: "m" });

    expect(result.pushWarning).toContain("401 Unauthorized");
    expect(mockPublishEventSave).toHaveBeenCalledOnce();
    errSpy.mockRestore();
  });

  it("falls back to a generic warning when push rejects with a non-Error", async () => {
    mockGetRemoteConfig.mockResolvedValue({ url: "u", branch: "main", token: "t" });
    const gitSvc = makeGitSvc({
      push: vi.fn().mockRejectedValue("boom"),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await finalizePublish("proj-1", gitSvc, { publishMessage: "m" });

    expect(result.pushWarning).toBe("Push to remote failed");
    errSpy.mockRestore();
  });

  it("skips push when no remote is configured", async () => {
    mockGetRemoteConfig.mockResolvedValue(null);
    const gitSvc = makeGitSvc();

    await finalizePublish("proj-1", gitSvc, { publishMessage: "m" });

    expect(gitSvc.push).not.toHaveBeenCalled();
  });
});
