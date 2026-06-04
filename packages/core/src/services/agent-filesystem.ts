import { resolve, relative, isAbsolute } from "node:path";
import { cp, rename as fsRename, rm, lstat, access } from "node:fs/promises";
import { FilesystemBackend } from "deepagents";
import yaml from "js-yaml";

const YAML_EXT = /\.ya?ml$/i;

export class ValidatingFilesystemBackend extends FilesystemBackend {
  // Tail-chaining promise mutex that serialises mutating operations on this
  // backend instance. The agent's tool node runs parallel tool calls with
  // `Promise.all`, and `write`/`edit` are read-modify-write against the disk.
  // Without serialisation, several parallel `edit_file`/`write_file` calls all
  // read the same original content and the last write clobbers the rest, so
  // only one edit ends up persisted. Reads (ls/read/grep/glob/readRaw) are not
  // serialised — they don't mutate state.
  private mutationTail: Promise<unknown> = Promise.resolve();

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    // Chain onto the previous mutation regardless of whether it resolved or
    // rejected, so one failed op never wedges the queue.
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  protected resolveVirtualPath(key: string): string {
    if (this.virtualMode) {
      const vpath = key.startsWith("/") ? key : "/" + key;
      if (vpath.includes("..") || vpath.startsWith("~"))
        throw new Error("Path traversal not allowed");
      const full = resolve(this.cwd, vpath.substring(1));
      const rel = relative(this.cwd, full);
      if (rel.startsWith("..") || isAbsolute(rel))
        throw new Error(`Path outside root directory`);
      return full;
    }
    if (isAbsolute(key)) return key;
    return resolve(this.cwd, key);
  }

  async delete(
    filePath: string,
    recursive = false,
  ): Promise<{ error?: string; path?: string }> {
    return this.runExclusive(async () => {
      try {
        const resolved = this.resolveVirtualPath(filePath);
        const stat = await lstat(resolved);
        if (stat.isSymbolicLink())
          return { error: `Symlinks are not allowed: ${filePath}` };
        if (stat.isDirectory() && !recursive)
          return { error: `'${filePath}' is a directory — set recursive to true to delete it.` };
        await rm(resolved, { recursive });
        return { path: filePath };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ENOENT"))
          return { error: `'${filePath}' not found` };
        return { error: `Error deleting '${filePath}': ${msg}` };
      }
    });
  }

  async rename(
    oldPath: string,
    newPath: string,
  ): Promise<{ error?: string; oldPath?: string; newPath?: string }> {
    return this.runExclusive(async () => {
      try {
        const resolvedOld = this.resolveVirtualPath(oldPath);
        const resolvedNew = this.resolveVirtualPath(newPath);

        const oldStat = await lstat(resolvedOld);
        if (oldStat.isSymbolicLink())
          return { error: `Symlinks are not allowed: ${oldPath}` };

        try {
          await access(resolvedNew);
          return { error: `Target already exists: ${newPath}` };
        } catch {
          // target doesn't exist — good
        }

        await fsRename(resolvedOld, resolvedNew);
        return { oldPath, newPath };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ENOENT"))
          return { error: `'${oldPath}' not found` };
        return { error: `Error renaming '${oldPath}': ${msg}` };
      }
    });
  }

  async copy(
    srcPath: string,
    destPath: string,
    recursive = false,
  ): Promise<{ error?: string; srcPath?: string; destPath?: string }> {
    return this.runExclusive(async () => {
      try {
        const resolvedSrc = this.resolveVirtualPath(srcPath);
        const resolvedDest = this.resolveVirtualPath(destPath);

        const srcStat = await lstat(resolvedSrc);
        if (srcStat.isSymbolicLink())
          return { error: `Symlinks are not allowed: ${srcPath}` };
        if (srcStat.isDirectory() && !recursive)
          return { error: `'${srcPath}' is a directory — set recursive to true to copy it.` };

        try {
          await access(resolvedDest);
          return { error: `Target already exists: ${destPath}` };
        } catch {
          // target doesn't exist — good
        }

        await cp(resolvedSrc, resolvedDest, { recursive });
        return { srcPath, destPath };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ENOENT"))
          return { error: `'${srcPath}' not found` };
        return { error: `Error copying '${srcPath}': ${msg}` };
      }
    });
  }

  override async write(
    filePath: string,
    content: string,
  ) {
    return this.runExclusive(async () => {
      if (YAML_EXT.test(filePath)) {
        try {
          yaml.load(content);
        } catch (err) {
          const msg = err instanceof yaml.YAMLException ? err.message : String(err);
          return { error: `YAML syntax error: ${msg}` };
        }
      }
      return super.write(filePath, content);
    });
  }

  override async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean,
  ) {
    return this.runExclusive(async () => {
      const result = await super.edit(filePath, oldString, newString, replaceAll);
      if (result.error || !YAML_EXT.test(filePath)) return result;

      try {
        const raw = await this.readRaw(filePath);
        if (raw.error || !raw.data) {
          return { ...result, error: `YAML syntax error after edit: ${raw.error ?? "unable to read file"}` };
        }
        const { content } = raw.data;
        const text = Array.isArray(content)
          ? content.join("\n")
          : typeof content === "string"
            ? content
            : new TextDecoder().decode(content);
        yaml.load(text);
      } catch (err) {
        const msg = err instanceof yaml.YAMLException ? err.message : String(err);
        return { ...result, error: `YAML syntax error after edit: ${msg}` };
      }
      return result;
    });
  }
}
