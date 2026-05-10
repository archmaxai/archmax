import fs from "node:fs";
import { join, resolve } from "node:path";
import { readdir, readFile, writeFile, unlink, stat, mkdir, rm } from "node:fs/promises";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

const AUTHOR = { name: "archmax", email: "archmax@localhost" };

const DEFAULT_GITIGNORE = `large_tool_results/
.*tmp
duckdb.db
duckdb.db.wal
duckdb.db.tmp
`;

export interface GitLogEntry {
  oid: string;
  message: string;
  author: { name: string; email: string };
  timestamp: string;
}

export interface PaginatedLog {
  entries: GitLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface SyncResult {
  conflicts: boolean;
  conflictedFiles: string[];
  newCommits: number;
  message: string;
}

export interface GitRemoteConfig {
  url: string;
  branch: string;
  token: string;
}

function onAuth(token: string) {
  return () => ({ username: "x-access-token", password: token });
}

export class GitService {
  constructor(public readonly dir: string) {}

  async isInitialized(): Promise<boolean> {
    try {
      const s = await stat(join(this.dir, ".git"));
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  async reinit(): Promise<void> {
    const gitDir = join(this.dir, ".git");
    await rm(gitDir, { recursive: true, force: true });
    await this.ensureRepo();
  }

  async ensureRepo(): Promise<{ created: boolean }> {
    if (await this.isInitialized()) return { created: false };
    await mkdir(this.dir, { recursive: true });
    await git.init({ fs, dir: this.dir, defaultBranch: "main" });

    const gitignorePath = join(this.dir, ".gitignore");
    try {
      await stat(gitignorePath);
    } catch {
      await writeFile(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
    }

    await this.stageAll();
    const hasStaged = await this.hasStagedChanges();
    if (hasStaged) {
      await git.commit({
        fs,
        dir: this.dir,
        message: "Initial commit",
        author: AUTHOR,
      });
    }

    return { created: true };
  }

  async commit(message: string): Promise<string> {
    await this.ensureRepo();
    await this.stageAll();
    const oid = await git.commit({
      fs,
      dir: this.dir,
      message,
      author: AUTHOR,
    });
    return oid;
  }

  async push(remote: GitRemoteConfig): Promise<void> {
    const result = await git.push({
      fs,
      http,
      dir: this.dir,
      remote: "origin",
      ref: remote.branch,
      onAuth: onAuth(remote.token),
    });

    if (result.error) {
      throw new Error(`Push failed: ${result.error}`);
    }

    await git.setConfig({ fs, dir: this.dir, path: `branch.${remote.branch}.remote`, value: "origin" });
    await git.setConfig({ fs, dir: this.dir, path: `branch.${remote.branch}.merge`, value: `refs/heads/${remote.branch}` });
  }

  async pull(remote: GitRemoteConfig): Promise<SyncResult> {
    await this.ensureRepo();
    await this.ensureRemote(remote.url);

    await git.fetch({
      fs,
      http,
      dir: this.dir,
      remote: "origin",
      ref: remote.branch,
      singleBranch: true,
      onAuth: onAuth(remote.token),
    });

    let remoteOid: string;
    try {
      remoteOid = await git.resolveRef({
        fs,
        dir: this.dir,
        ref: `refs/remotes/origin/${remote.branch}`,
      });
    } catch {
      return { conflicts: false, conflictedFiles: [], newCommits: 0, message: "Remote branch not found" };
    }

    let localOid: string;
    try {
      localOid = await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" });
    } catch {
      await git.merge({
        fs,
        dir: this.dir,
        ours: remote.branch,
        theirs: `remotes/origin/${remote.branch}`,
        author: AUTHOR,
        fastForward: true,
      });
      await git.checkout({ fs, dir: this.dir, ref: remote.branch });
      return { conflicts: false, conflictedFiles: [], newCommits: 1, message: "Fast-forwarded to remote" };
    }

    if (localOid === remoteOid) {
      return { conflicts: false, conflictedFiles: [], newCommits: 0, message: "Already up to date" };
    }

    try {
      await git.merge({
        fs,
        dir: this.dir,
        ours: remote.branch,
        theirs: `remotes/origin/${remote.branch}`,
        author: AUTHOR,
        abortOnConflict: true,
      });
      await git.checkout({ fs, dir: this.dir, ref: remote.branch, force: true });
      return { conflicts: false, conflictedFiles: [], newCommits: 1, message: "Merged upstream changes" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isUnsupported = msg.includes("Merges with conflicts are not supported")
        || msg.includes("Could not find a merge base");

      if (isUnsupported) {
        return this.mergeUnrelatedHistories(localOid, remoteOid, remote.branch);
      }

      const conflictedFiles = await this.detectConflicts();
      if (conflictedFiles.length > 0) {
        return {
          conflicts: true,
          conflictedFiles,
          newCommits: 0,
          message: "Merge conflicts detected. Resolve the conflicts before publishing.",
        };
      }
      throw err;
    }
  }

  /**
   * Handles the case where local and remote have no common ancestor
   * (e.g. local was initialized independently from the remote).
   * Writes remote-only files into the working tree and creates a merge commit.
   */
  private async mergeUnrelatedHistories(
    localOid: string,
    remoteOid: string,
    branch: string,
  ): Promise<SyncResult> {
    const remoteFiles = await this.listTree(remoteOid);
    const localFiles = await this.listTree(localOid);
    const localPaths = new Set(localFiles.map((f) => f.filepath));
    const conflicted: string[] = [];

    for (const { filepath, oid } of remoteFiles) {
      if (localPaths.has(filepath)) {
        const localEntry = localFiles.find((f) => f.filepath === filepath);
        if (localEntry && localEntry.oid !== oid) {
          conflicted.push(filepath);
        }
        continue;
      }
      const { blob } = await git.readBlob({ fs, dir: this.dir, oid });
      const fullPath = join(this.dir, filepath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, Buffer.from(blob));
    }

    if (conflicted.length > 0) {
      return {
        conflicts: true,
        conflictedFiles: conflicted,
        newCommits: 0,
        message: "Merge conflicts detected in files that exist in both local and remote with different content.",
      };
    }

    await this.stageAll();
    await git.commit({
      fs,
      dir: this.dir,
      message: "Merge remote changes",
      author: AUTHOR,
      parent: [localOid, remoteOid],
    });
    await git.checkout({ fs, dir: this.dir, ref: branch, force: true });

    return { conflicts: false, conflictedFiles: [], newCommits: 1, message: "Merged remote changes (unrelated histories)" };
  }

  private async listTree(commitOid: string): Promise<Array<{ filepath: string; oid: string }>> {
    const files: Array<{ filepath: string; oid: string }> = [];
    const { commit } = await git.readCommit({ fs, dir: this.dir, oid: commitOid });
    await this.walkTree(commit.tree, "", files);
    return files;
  }

  private async walkTree(
    treeOid: string,
    prefix: string,
    acc: Array<{ filepath: string; oid: string }>,
  ): Promise<void> {
    const { tree } = await git.readTree({ fs, dir: this.dir, oid: treeOid });
    for (const entry of tree) {
      const entryPath = prefix ? `${prefix}/${entry.path}` : entry.path;
      if (entry.type === "blob") {
        acc.push({ filepath: entryPath, oid: entry.oid });
      } else if (entry.type === "tree") {
        await this.walkTree(entry.oid, entryPath, acc);
      }
    }
  }

  /**
   * Restores the working tree to match the given commit's state without
   * creating a commit. Returns a derived "Revert to: ..." message for the
   * caller to use when it commits, or `null` when HEAD is already at `oid`.
   *
   * This keeps the revert a single commit once the caller runs the publish
   * flow (reassemble → commit), instead of producing a separate restore
   * commit followed by a build commit.
   */
  async revertToCommit(oid: string): Promise<{ message: string } | null> {
    await this.ensureRepo();

    let headOid: string;
    try {
      headOid = await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" });
    } catch {
      throw new Error("No commits yet — nothing to revert to");
    }

    if (headOid === oid) return null;

    let sourceMessage: string;
    try {
      const { commit: commitData } = await git.readCommit({ fs, dir: this.dir, oid });
      sourceMessage = commitData.message.trim();
    } catch {
      throw new Error(`Commit ${oid} not found`);
    }

    const targetFiles = await this.listTree(oid);
    const currentFiles = await this.listTree(headOid);
    const targetPaths = new Set(targetFiles.map((f) => f.filepath));

    for (const { filepath } of currentFiles) {
      if (!targetPaths.has(filepath)) {
        await unlink(join(this.dir, filepath)).catch(() => {});
      }
    }

    for (const { filepath, oid: blobOid } of targetFiles) {
      const { blob } = await git.readBlob({ fs, dir: this.dir, oid: blobOid });
      const fullPath = join(this.dir, filepath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, Buffer.from(blob));
    }

    return { message: `Revert to: ${sourceMessage.split("\n")[0]}` };
  }

  async log(opts?: { limit?: number; page?: number }): Promise<PaginatedLog> {
    const limit = opts?.limit ?? 10;
    const page = opts?.page ?? 1;
    const empty: PaginatedLog = { entries: [], total: 0, page, limit };

    if (!(await this.isInitialized())) return empty;
    try {
      const all = await git.log({ fs, dir: this.dir });
      const total = all.length;
      const start = (page - 1) * limit;
      const slice = all.slice(start, start + limit);
      const entries = slice.map((c) => ({
        oid: c.oid,
        message: c.commit.message,
        author: {
          name: c.commit.author.name,
          email: c.commit.author.email,
        },
        timestamp: new Date(c.commit.author.timestamp * 1000).toISOString(),
      }));
      return { entries, total, page, limit };
    } catch {
      return empty;
    }
  }

  async revertFile(filePath: string): Promise<{ reverted: boolean; deleted: boolean }> {
    await this.ensureRepo();
    const fullPath = resolve(join(this.dir, filePath));
    if (!fullPath.startsWith(resolve(this.dir) + "/")) {
      throw new Error("Path traversal not allowed");
    }

    let headOid: string;
    try {
      headOid = await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" });
    } catch {
      throw new Error("No commits yet — nothing to revert to");
    }
    let existsInHead = false;
    try {
      const { blob } = await git.readBlob({
        fs,
        dir: this.dir,
        oid: headOid,
        filepath: filePath,
      });
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, Buffer.from(blob));
      existsInHead = true;
    } catch {
      existsInHead = false;
    }

    if (!existsInHead) {
      try {
        await stat(fullPath);
        await unlink(fullPath);
        return { reverted: false, deleted: true };
      } catch {
        throw new Error(`File "${filePath}" not found on disk or in HEAD`);
      }
    }

    return { reverted: true, deleted: false };
  }

  async discardAllChanges(): Promise<void> {
    await this.ensureRepo();
    try {
      await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" });
    } catch {
      return;
    }
    await git.checkout({ fs, dir: this.dir, ref: "HEAD", force: true });

    const matrix = await git.statusMatrix({ fs, dir: this.dir });
    for (const [filepath, headStatus, workdirStatus] of matrix) {
      if (headStatus === 0 && workdirStatus > 0) {
        await unlink(join(this.dir, filepath)).catch(() => {});
      }
    }
  }

  async detectConflicts(): Promise<string[]> {
    const conflicted: string[] = [];
    await this.walkDir(this.dir, async (relPath, fullPath) => {
      if (!relPath.endsWith(".yaml") && !relPath.endsWith(".yml") && !relPath.endsWith(".md")) return;
      try {
        const content = await readFile(fullPath, "utf-8");
        if (content.includes("<<<<<<<")) {
          conflicted.push(relPath);
        }
      } catch { /* skip unreadable */ }
    });
    return conflicted;
  }

  private async stageAll(): Promise<void> {
    const matrix = await git.statusMatrix({ fs, dir: this.dir });
    for (const [filepath, headStatus, workdirStatus, stageStatus] of matrix) {
      if (filepath.startsWith(".git/") || filepath.startsWith(".git\\")) continue;

      if (workdirStatus === 0 && headStatus === 1) {
        await git.remove({ fs, dir: this.dir, filepath });
      } else if (workdirStatus !== stageStatus || headStatus !== stageStatus) {
        await git.add({ fs, dir: this.dir, filepath });
      }
    }
  }

  private async hasStagedChanges(): Promise<boolean> {
    const matrix = await git.statusMatrix({ fs, dir: this.dir });
    return matrix.some(([, head, , stage]) => head !== stage);
  }

  private async ensureRemote(url: string): Promise<void> {
    const remotes = await git.listRemotes({ fs, dir: this.dir });
    const existing = remotes.find((r) => r.remote === "origin");
    if (existing) {
      if (existing.url !== url) {
        await git.deleteRemote({ fs, dir: this.dir, remote: "origin" });
        await git.addRemote({ fs, dir: this.dir, remote: "origin", url });
      }
    } else {
      await git.addRemote({ fs, dir: this.dir, remote: "origin", url });
    }
  }

  private async walkDir(
    dir: string,
    cb: (relPath: string, fullPath: string) => Promise<void>,
    prefix = "",
  ): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = join(dir, entry);
      const relPath = prefix ? `${prefix}/${entry}` : entry;
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await this.walkDir(fullPath, cb, relPath);
        } else if (s.isFile()) {
          await cb(relPath, fullPath);
        }
      } catch { /* skip */ }
    }
  }
}
