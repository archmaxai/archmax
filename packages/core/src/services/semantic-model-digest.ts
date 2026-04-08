import type { SemanticModel, Dataset, Field, CustomExtension } from "./semantic-model-schema";
import { scopedViewName } from "./duckdb";

export const DEFAULT_ITEMS_PER_PAGE = 50;

export interface DigestPage {
  content: string;
  page: number;
  totalPages: number;
}

export type OverviewScope = "datasets" | "relationships" | "metrics";

export interface OverviewOptions {
  scope?: OverviewScope;
  page?: number;
  itemsPerPage?: number;
  showViewNames?: boolean;
}

interface NormalizedAiContext {
  instructions?: string;
  synonyms?: string[];
  examples?: string[];
}

interface PaginationResult<T> {
  pageItems: T[];
  page: number;
  totalPages: number;
  remaining: number;
}

function paginate<T>(items: T[], requestedPage: number, perPage: number): PaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  const start = (page - 1) * perPage;
  const pageItems = items.slice(start, start + perPage);
  const remaining = items.length - start - pageItems.length;
  return { pageItems, page, totalPages, remaining };
}

function appendPaginationHint(
  lines: string[],
  remaining: number,
  page: number,
  label: string,
  scopeName?: OverviewScope,
): void {
  if (remaining <= 0) return;
  if (scopeName) {
    lines.push("", `*${remaining} more ${label} — use \`scope: "${scopeName}"\` to paginate*`);
  } else {
    lines.push("", `*${remaining} more ${label} — request page ${page + 1}*`);
  }
}

function appendDatasetsSection(
  lines: string[],
  datasets: Dataset[],
  requestedPage: number,
  perPage: number,
  scopeHint?: OverviewScope,
  showViewNames?: boolean,
  modelName?: string,
): PaginationResult<Dataset> {
  const result = paginate(datasets, requestedPage, perPage);
  lines.push("", `## Datasets (${datasets.length})`);
  if (showViewNames && modelName) {
    lines.push("| Dataset | Source | Fields | VIEW | Description |");
    lines.push("|---------|--------|--------|------|-------------|");
    for (const ds of result.pageItems) {
      const viewName = scopedViewName(modelName, ds.name);
      lines.push(
        `| ${ds.name} | ${ds.source} | ${ds.fields.length} | \`${viewName}\` | ${oneLine(ds.description)} |`,
      );
    }
  } else {
    lines.push("| Dataset | Source | Fields | Description |");
    lines.push("|---------|--------|--------|-------------|");
    for (const ds of result.pageItems) {
      lines.push(
        `| ${ds.name} | ${ds.source} | ${ds.fields.length} | ${oneLine(ds.description)} |`,
      );
    }
  }
  appendPaginationHint(lines, result.remaining, result.page, "datasets", scopeHint);
  return result;
}

function appendRelationshipsSection(
  lines: string[],
  relationships: SemanticModel["relationships"],
  requestedPage: number,
  perPage: number,
  scopeHint?: OverviewScope,
): PaginationResult<SemanticModel["relationships"][number]> {
  const result = paginate(relationships, requestedPage, perPage);
  lines.push("", `## Relationships (${relationships.length})`);
  for (const r of result.pageItems) {
    lines.push(
      `- ${r.from}.${r.from_columns.join(",")} → ${r.to}.${r.to_columns.join(",")}`,
    );
  }
  appendPaginationHint(lines, result.remaining, result.page, "relationships", scopeHint);
  return result;
}

function appendMetricsSection(
  lines: string[],
  metrics: SemanticModel["metrics"],
  requestedPage: number,
  perPage: number,
  scopeHint?: OverviewScope,
): PaginationResult<SemanticModel["metrics"][number]> {
  const result = paginate(metrics, requestedPage, perPage);
  lines.push("", `## Metrics (${metrics.length})`);
  lines.push("| Metric | Expression | Description |");
  lines.push("|--------|-----------|-------------|");
  for (const m of result.pageItems) {
    const expr = m.expression.dialects[0]?.expression ?? "";
    lines.push(`| ${m.name} | \`${expr}\` | ${oneLine(m.description)} |`);
  }
  appendPaginationHint(lines, result.remaining, result.page, "metrics", scopeHint);
  return result;
}

export class SemanticModelDigest {
  static overview(model: SemanticModel, options?: OverviewOptions): DigestPage {
    const scope = options?.scope;
    const requestedPage = options?.page ?? 1;
    const perPage = options?.itemsPerPage ?? DEFAULT_ITEMS_PER_PAGE;
    const showViews = options?.showViewNames ?? true;

    const lines: string[] = [`# ${model.name}`];
    if (model.description) lines.push(oneLine(model.description));

    const ctx = normalizeAiContext(model.ai_context);
    if (ctx?.instructions) lines.push("", `> ${oneLine(ctx.instructions)}`);

    if (!scope) {
      appendDatasetsSection(lines, model.datasets, 1, perPage, "datasets", showViews, model.name);

      if (model.relationships.length > 0) {
        appendRelationshipsSection(lines, model.relationships, 1, perPage, "relationships");
      }

      if (model.metrics.length > 0) {
        appendMetricsSection(lines, model.metrics, 1, perPage, "metrics");
      }

      const modelQueries = parseValidatedQueries(model.custom_extensions);
      if (modelQueries.length > 0) {
        lines.push("", `## Validated Queries (${modelQueries.length})`);
        modelQueries.forEach((q, i) => {
          lines.push(`${i + 1}. **${oneLine(q.description)}** — \`${q.query}\``);
        });
      }

      return { content: lines.join("\n"), page: 1, totalPages: 1 };
    }

    let result: PaginationResult<unknown>;
    switch (scope) {
      case "datasets":
        result = appendDatasetsSection(lines, model.datasets, requestedPage, perPage, undefined, showViews, model.name);
        break;
      case "relationships":
        result = appendRelationshipsSection(lines, model.relationships, requestedPage, perPage);
        break;
      case "metrics":
        result = appendMetricsSection(lines, model.metrics, requestedPage, perPage);
        break;
    }

    return { content: lines.join("\n"), page: result.page, totalPages: result.totalPages };
  }

  static datasets(
    datasets: Dataset[],
    page: number,
    itemsPerPage: number = DEFAULT_ITEMS_PER_PAGE,
  ): DigestPage {
    if (datasets.length === 0) {
      return { content: "No datasets provided.", page: 1, totalPages: 1 };
    }
    if (datasets.length === 1) {
      return SemanticModelDigest.dataset(datasets[0], page, itemsPerPage);
    }
    const sections = datasets.map((ds) =>
      SemanticModelDigest.dataset(ds, 1, itemsPerPage).content,
    );
    return {
      content: sections.join("\n\n---\n\n"),
      page: 1,
      totalPages: 1,
    };
  }

  static dataset(dataset: Dataset, page = 1, itemsPerPage = DEFAULT_ITEMS_PER_PAGE): DigestPage {
    const perPage = itemsPerPage;
    const totalPages = Math.max(1, Math.ceil(dataset.fields.length / perPage));
    const clamped = Math.max(1, Math.min(page, totalPages));
    const start = (clamped - 1) * perPage;
    const pageFields = dataset.fields.slice(start, start + perPage);

    const lines: string[] = [
      `# ${dataset.name} (${dataset.source}) — page ${clamped}/${totalPages}`,
    ];
    if (dataset.description) lines.push(oneLine(dataset.description));

    const dsCtx = normalizeAiContext(dataset.ai_context);
    const meta: string[] = [];
    if (dataset.primary_key?.length) meta.push(`PK: ${dataset.primary_key.join(", ")}`);
    if (dsCtx?.synonyms?.length) meta.push(`Aliases: ${dsCtx.synonyms.join(", ")}`);
    if (meta.length) lines.push(meta.join(" | "));

    if (dsCtx?.instructions) lines.push("", `> ${oneLine(dsCtx.instructions)}`);

    lines.push("", `## Fields (${dataset.fields.length})`);
    lines.push("");
    for (const f of pageFields) {
      lines.push(formatField(f));
    }

    const remaining = dataset.fields.length - start - pageFields.length;
    if (remaining > 0) {
      lines.push("", `*${remaining} more fields — request page ${clamped + 1}*`);
    }

    const dsQueries = parseValidatedQueries(dataset.custom_extensions);
    if (dsQueries.length > 0) {
      lines.push("", `## Validated Queries (${dsQueries.length})`);
      dsQueries.forEach((q, i) => {
        lines.push(`${i + 1}. **${oneLine(q.description)}** — \`${q.query}\``);
      });
    }

    return { content: lines.join("\n"), page: clamped, totalPages };
  }
}

export function formatField(f: Field): string {
  const ext = parseCommonExtension(f);
  const ctx = normalizeAiContext(f.ai_context);

  let type = ext?.data_type ?? "?";
  if (f.dimension?.is_time) type += " 🕐";

  let typeStr = `\`${type}\``;
  if (ext?.distinct_values?.length) {
    typeStr += ` {${ext.distinct_values.join(", ")}}`;
  }

  let core = `- **${f.name}** ${typeStr} — ${oneLine(f.description)}`;

  const expr = f.expression?.dialects?.[0]?.expression;
  if (expr && expr !== f.name) {
    core += ` Expr: \`${expr}\`.`;
  }

  if (ext?.example_data?.length) {
    core += ` Ex: ${ext.example_data.map((e) => `\`${e}\``).join(", ")}`;
  }

  const tail: string[] = [];
  if (ctx?.synonyms?.length) tail.push(`_${ctx.synonyms.join(", ")}_`);
  if (ctx?.instructions) tail.push(`Note: ${oneLine(ctx.instructions)}`);
  if (tail.length) core += " | " + tail.join(" | ");

  return core;
}

export function oneLine(s?: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeAiContext(
  ctx: string | { instructions?: string; synonyms?: string[]; examples?: string[] } | undefined,
): NormalizedAiContext | null {
  if (!ctx) return null;
  if (typeof ctx === "string") return { instructions: ctx };
  return ctx;
}

export function parseCommonExtension(field: Field): {
  data_type?: string;
  example_data?: string[];
  distinct_values?: string[];
} | null {
  const ext = field.custom_extensions?.find((e) => e.vendor_name === "COMMON");
  if (!ext) return null;
  try {
    return JSON.parse(ext.data) as {
      data_type?: string;
      example_data?: string[];
      distinct_values?: string[];
    };
  } catch {
    return null;
  }
}

export interface ValidatedQuery {
  description: string;
  query: string;
}

export function parseValidatedQueries(
  extensions?: CustomExtension[],
): ValidatedQuery[] {
  const ext = extensions?.find((e) => e.vendor_name === "COMMON");
  if (!ext) return [];
  try {
    const data = JSON.parse(ext.data) as { validated_queries?: ValidatedQuery[] };
    if (!Array.isArray(data.validated_queries)) return [];
    return data.validated_queries.filter(
      (q) => typeof q.description === "string" && typeof q.query === "string",
    );
  } catch {
    return [];
  }
}
