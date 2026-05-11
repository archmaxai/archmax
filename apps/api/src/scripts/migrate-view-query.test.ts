import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { buildLegacyViewQuery, runMigration, processDatasetFile } from "./migrate-view-query";

interface DatasetYaml {
  name: string;
  source: string;
  fields?: Array<{ name: string; expression: { dialects: Array<{ dialect: string; expression: string }> } }>;
  custom_extensions?: Array<{ vendor_name: string; data: string }>;
  primary_key?: string[];
}

function makeField(name: string, expression: string = name) {
  return {
    name,
    expression: { dialects: [{ dialect: "ANSI_SQL" as const, expression }] },
    description: "",
    custom_extensions: [],
  };
}

function makeDatasetYaml(ds: DatasetYaml): string {
  return yaml.dump({ dataset: ds }, { lineWidth: 120, noRefs: true });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function readViewQuery(extensions: Array<{ vendor_name: string; data: string }> | undefined): string | null {
  const ext = extensions?.find((e) => e.vendor_name === "COMMON");
  if (!ext) return null;
  try {
    const parsed = JSON.parse(ext.data);
    return typeof parsed.view_query === "string" ? parsed.view_query : null;
  } catch {
    return null;
  }
}

describe("buildLegacyViewQuery", () => {
  it("returns null for a dataset with no fields", () => {
    const result = buildLegacyViewQuery({
      name: "empty",
      source: "shop.public.empty",
      primary_key: [],
      unique_keys: [],
      description: "",
      fields: [],
      custom_extensions: [],
    });
    expect(result).toBeNull();
  });

  it("emits one column per line for a simple dataset", () => {
    const result = buildLegacyViewQuery({
      name: "orders",
      source: "shop.public.orders",
      primary_key: [],
      unique_keys: [],
      description: "",
      fields: [
        makeField("id"),
        makeField("status"),
      ],
      custom_extensions: [],
    });
    expect(result).toBe(`SELECT\n  "id",\n  "status"\nFROM shop.public.orders`);
  });

  it("aliases simple identifier expressions when name differs", () => {
    const result = buildLegacyViewQuery({
      name: "stammdaten",
      source: "hr.public.staff",
      primary_key: [],
      unique_keys: [],
      description: "",
      fields: [
        makeField("personnelnumber"),
        makeField("person_id", "personid"),
      ],
      custom_extensions: [],
    });
    expect(result).toContain('"personid" AS "person_id"');
    expect(result).toContain('"personnelnumber"');
  });

  it("preserves computed expressions verbatim", () => {
    const result = buildLegacyViewQuery({
      name: "orders",
      source: "shop.public.orders",
      primary_key: [],
      unique_keys: [],
      description: "",
      fields: [
        makeField("full_name", "c_first_name || ' ' || c_last_name"),
      ],
      custom_extensions: [],
    });
    expect(result).toContain(`c_first_name || ' ' || c_last_name AS "full_name"`);
  });
});

describe("runMigration", () => {
  let baseDir: string;
  let logEntries: Array<{ level: string; message: string }>;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "archmax-migrate-"));
    logEntries = [];
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function captureLog(level: "INFO" | "WARN" | "ERROR", message: string): void {
    logEntries.push({ level, message });
  }

  async function writeDataset(projectId: string, modelName: string, datasetName: string, ds: DatasetYaml): Promise<string> {
    const dir = join(baseDir, projectId, "src", modelName);
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${datasetName}.yaml`);
    await writeFile(file, makeDatasetYaml(ds), "utf-8");
    return file;
  }

  it("migrates a dataset with simple fields and writes a .yaml.bak", async () => {
    const file = await writeDataset("p1", "shop", "orders", {
      name: "orders",
      source: "shop.public.orders",
      fields: [makeField("id"), makeField("total_amount"), makeField("status")],
    });
    const counts = await runMigration({ baseDir, log: captureLog });

    expect(counts).toEqual({
      total: 1,
      migrated: 1,
      skippedAlreadyMigrated: 0,
      skippedExistingBackup: 0,
      errored: 0,
    });
    expect(await fileExists(`${file}.bak`)).toBe(true);

    const updated = yaml.load(await readFile(file, "utf-8")) as { dataset: DatasetYaml };
    const viewQuery = readViewQuery(updated.dataset.custom_extensions);
    expect(viewQuery).toBe(`SELECT\n  "id",\n  "total_amount",\n  "status"\nFROM shop.public.orders`);
  });

  it("preserves field aliasing in the migrated view_query", async () => {
    await writeDataset("p1", "hr", "stammdaten", {
      name: "stammdaten",
      source: "hr.public.staff",
      fields: [
        makeField("personnelnumber"),
        makeField("person_id", "personid"),
      ],
    });
    await runMigration({ baseDir, log: captureLog });

    const updated = yaml.load(await readFile(join(baseDir, "p1", "src", "hr", "stammdaten.yaml"), "utf-8")) as { dataset: DatasetYaml };
    const viewQuery = readViewQuery(updated.dataset.custom_extensions);
    expect(viewQuery).toContain('"personid" AS "person_id"');
  });

  it("preserves computed expressions verbatim", async () => {
    await writeDataset("p1", "shop", "people", {
      name: "people",
      source: "shop.public.people",
      fields: [
        makeField("full_name", "c_first_name || ' ' || c_last_name"),
      ],
    });
    await runMigration({ baseDir, log: captureLog });

    const updated = yaml.load(await readFile(join(baseDir, "p1", "src", "shop", "people.yaml"), "utf-8")) as { dataset: DatasetYaml };
    const viewQuery = readViewQuery(updated.dataset.custom_extensions);
    expect(viewQuery).toContain(`c_first_name || ' ' || c_last_name AS "full_name"`);
  });

  it("is idempotent — second run skips already-migrated datasets and writes no new .yaml.bak", async () => {
    const file = await writeDataset("p1", "shop", "orders", {
      name: "orders",
      source: "shop.public.orders",
      fields: [makeField("id")],
    });
    await runMigration({ baseDir, log: captureLog });
    const backupContentBefore = await readFile(`${file}.bak`, "utf-8");

    logEntries = [];
    const counts = await runMigration({ baseDir, log: captureLog });

    expect(counts.migrated).toBe(0);
    expect(counts.skippedAlreadyMigrated).toBe(1);
    expect(counts.errored).toBe(0);
    // backup must not have been overwritten
    const backupContentAfter = await readFile(`${file}.bak`, "utf-8");
    expect(backupContentAfter).toBe(backupContentBefore);
  });

  it("refuses to overwrite a pre-existing .yaml.bak and counts under skippedExistingBackup", async () => {
    const file = await writeDataset("p1", "shop", "orders", {
      name: "orders",
      source: "shop.public.orders",
      fields: [makeField("id")],
    });
    await writeFile(`${file}.bak`, "manual-backup-content", "utf-8");

    const counts = await runMigration({ baseDir, log: captureLog });

    expect(counts.skippedExistingBackup).toBe(1);
    expect(counts.migrated).toBe(0);
    // The original file must not have been modified.
    const updated = yaml.load(await readFile(file, "utf-8")) as { dataset: DatasetYaml };
    expect(readViewQuery(updated.dataset.custom_extensions)).toBeNull();
    expect(await readFile(`${file}.bak`, "utf-8")).toBe("manual-backup-content");
    expect(logEntries.some((e) => e.level === "WARN" && /existing backup/i.test(e.message))).toBe(true);
  });

  it("counts datasets with no fields under errored and emits a loud WARN", async () => {
    await writeDataset("p1", "shop", "empty", {
      name: "empty",
      source: "shop.public.empty",
      fields: [],
    });

    const counts = await runMigration({ baseDir, log: captureLog });

    expect(counts.errored).toBe(1);
    expect(counts.migrated).toBe(0);
    const warn = logEntries.find((e) => e.level === "WARN" && /no fields/i.test(e.message));
    expect(warn).toBeDefined();
    expect(warn?.message).toContain("p1/shop/empty");
    // No .yaml.bak should have been written.
    expect(await fileExists(join(baseDir, "p1", "src", "shop", "empty.yaml.bak"))).toBe(false);
  });

  it("processDatasetFile mirrors the same outcomes when invoked directly", async () => {
    const file = await writeDataset("p2", "shop", "orders", {
      name: "orders",
      source: "shop.public.orders",
      fields: [makeField("id")],
    });
    const result = await processDatasetFile("p2", "shop", file, captureLog);
    expect(result).toBe("migrated");
  });

  it("does nothing when no projects are present", async () => {
    const counts = await runMigration({ baseDir, log: captureLog });
    expect(counts).toEqual({
      total: 0,
      migrated: 0,
      skippedAlreadyMigrated: 0,
      skippedExistingBackup: 0,
      errored: 0,
    });
  });
});
