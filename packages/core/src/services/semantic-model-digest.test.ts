import { describe, it, expect } from "vitest";
import {
  SemanticModelDigest,
  DEFAULT_ITEMS_PER_PAGE,
  formatField,
  oneLine,
  normalizeAiContext,
  parseCommonExtension,
  parseValidatedQueries,
} from "./semantic-model-digest";
import type { SemanticModel, Dataset, Field } from "./semantic-model-schema";

function makeField(overrides: Partial<Field> & { name: string }): Field {
  return {
    expression: { dialects: [{ dialect: "ANSI_SQL", expression: overrides.name }] },
    description: "",
    custom_extensions: [],
    ...overrides,
  };
}

function makeDataset(overrides: Partial<Dataset> & { name: string; source: string }): Dataset {
  return {
    primary_key: [],
    unique_keys: [],
    description: "",
    fields: [],
    custom_extensions: [],
    ...overrides,
  };
}

function makeModel(overrides: Partial<SemanticModel> & { name: string }): SemanticModel {
  return {
    description: "",
    datasets: [],
    relationships: [],
    metrics: [],
    custom_extensions: [],
    ...overrides,
  };
}

function makeRelationship(from: string, to: string, fromCol: string, toCol: string) {
  return {
    name: `${from}_to_${to}`,
    from,
    to,
    from_columns: [fromCol],
    to_columns: [toCol],
    custom_extensions: [],
  };
}

function makeMetric(name: string, expression: string) {
  return {
    name,
    expression: { dialects: [{ dialect: "ANSI_SQL", expression }] },
    description: `${name} description`,
    custom_extensions: [],
  };
}

describe("oneLine", () => {
  it("collapses whitespace and trims", () => {
    expect(oneLine("  hello\n  world  ")).toBe("hello world");
  });

  it("returns empty string for undefined", () => {
    expect(oneLine(undefined)).toBe("");
  });
});

describe("normalizeAiContext", () => {
  it("returns null for undefined", () => {
    expect(normalizeAiContext(undefined)).toBeNull();
  });

  it("wraps string as instructions", () => {
    expect(normalizeAiContext("Use this for analytics")).toEqual({
      instructions: "Use this for analytics",
    });
  });

  it("passes through object form", () => {
    const ctx = { instructions: "foo", synonyms: ["bar"] };
    expect(normalizeAiContext(ctx)).toBe(ctx);
  });
});

describe("parseCommonExtension", () => {
  it("returns null when no COMMON extension exists", () => {
    const field = makeField({ name: "id", custom_extensions: [] });
    expect(parseCommonExtension(field)).toBeNull();
  });

  it("parses COMMON extension data", () => {
    const field = makeField({
      name: "status",
      custom_extensions: [
        {
          vendor_name: "COMMON",
          data: '{"data_type":"VARCHAR","example_data":["active"],"distinct_values":["active","inactive"]}',
        },
      ],
    });
    const ext = parseCommonExtension(field);
    expect(ext?.data_type).toBe("VARCHAR");
    expect(ext?.example_data).toEqual(["active"]);
    expect(ext?.distinct_values).toEqual(["active", "inactive"]);
  });

  it("returns null for malformed JSON", () => {
    const field = makeField({
      name: "bad",
      custom_extensions: [{ vendor_name: "COMMON", data: "not-json" }],
    });
    expect(parseCommonExtension(field)).toBeNull();
  });
});

describe("formatField", () => {
  it("renders a simple field with type and description", () => {
    const field = makeField({
      name: "id",
      description: "Unique identifier",
      custom_extensions: [
        { vendor_name: "COMMON", data: '{"data_type":"BIGINT","example_data":["123"]}' },
      ],
    });
    const line = formatField(field);
    expect(line).toContain("**id**");
    expect(line).toContain("`BIGINT`");
    expect(line).toContain("Unique identifier");
    expect(line).toContain("Ex: `123`");
  });

  it("omits expression when it matches field name", () => {
    const field = makeField({ name: "email", description: "Email" });
    expect(formatField(field)).not.toContain("Expr:");
  });

  it("includes expression when it differs from field name", () => {
    const field = makeField({
      name: "customer_id",
      description: "FK to customers",
      expression: {
        dialects: [
          { dialect: "ANSI_SQL", expression: "CAST(JSON_EXTRACT_STRING(customer, '$.id') AS BIGINT)" },
        ],
      },
    });
    const line = formatField(field);
    expect(line).toContain("Expr: `CAST(JSON_EXTRACT_STRING(customer, '$.id') AS BIGINT)`");
  });

  it("includes enum values inline with type", () => {
    const field = makeField({
      name: "status",
      description: "Status",
      custom_extensions: [
        {
          vendor_name: "COMMON",
          data: '{"data_type":"VARCHAR","distinct_values":["active","inactive"]}',
        },
      ],
    });
    const line = formatField(field);
    expect(line).toContain("`VARCHAR` {active, inactive}");
  });

  it("marks time dimensions", () => {
    const field = makeField({
      name: "created_at",
      description: "Created",
      dimension: { is_time: true },
      custom_extensions: [
        { vendor_name: "COMMON", data: '{"data_type":"TIMESTAMP"}' },
      ],
    });
    expect(formatField(field)).toContain("`TIMESTAMP 🕐`");
  });

  it("includes synonyms and instructions in tail", () => {
    const field = makeField({
      name: "total_price",
      description: "Total",
      ai_context: {
        synonyms: ["revenue", "order value"],
        instructions: "Use for gross revenue analysis",
      },
    });
    const line = formatField(field);
    expect(line).toContain("_revenue, order value_");
    expect(line).toContain("Note: Use for gross revenue analysis");
  });
});

describe("SemanticModelDigest.overview", () => {
  it("returns a DigestPage with page metadata", () => {
    const model = makeModel({ name: "test" });
    const result = SemanticModelDigest.overview(model);
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("page", 1);
    expect(result).toHaveProperty("totalPages", 1);
  });

  it("includes model name and description", () => {
    const model = makeModel({ name: "shopify", description: "E-commerce model" });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("# shopify");
    expect(content).toContain("E-commerce model");
  });

  it("includes ai_context instructions as blockquote", () => {
    const model = makeModel({
      name: "test",
      ai_context: { instructions: "Use orders as central table" },
    });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("> Use orders as central table");
  });

  it("renders dataset summary table", () => {
    const model = makeModel({
      name: "test",
      datasets: [
        makeDataset({
          name: "orders",
          source: "shop.public.orders",
          description: "Order data",
          fields: [makeField({ name: "id" }), makeField({ name: "total" })],
        }),
      ],
    });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("## Datasets (1)");
    expect(content).toContain("| orders | shop.public.orders | 2 | Order data |");
  });

  it("renders relationships as join paths", () => {
    const model = makeModel({
      name: "test",
      relationships: [makeRelationship("orders", "customers", "customer_id", "id")],
    });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("## Relationships (1)");
    expect(content).toContain("- orders.customer_id → customers.id");
  });

  it("renders metrics table", () => {
    const model = makeModel({
      name: "test",
      metrics: [makeMetric("total_revenue", "SUM(orders.total_price)")],
    });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("## Metrics (1)");
    expect(content).toContain("| total_revenue | `SUM(orders.total_price)` | total_revenue description |");
  });

  it("omits relationships section when empty", () => {
    const model = makeModel({ name: "test" });
    expect(SemanticModelDigest.overview(model).content).not.toContain("## Relationships");
  });

  it("omits metrics section when empty", () => {
    const model = makeModel({ name: "test" });
    expect(SemanticModelDigest.overview(model).content).not.toContain("## Metrics");
  });

  it("truncates datasets at 50 with scope hint when unscoped", () => {
    const datasets = Array.from({ length: 60 }, (_, i) =>
      makeDataset({ name: `ds_${i}`, source: `s.p.ds_${i}` }),
    );
    const model = makeModel({ name: "big", datasets });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("## Datasets (60)");
    expect(content).toContain("ds_0");
    expect(content).toContain("ds_49");
    expect(content).not.toContain("ds_50");
    expect(content).toContain('*10 more datasets — use `scope: "datasets"` to paginate*');
  });

  it("truncates relationships at 50 with scope hint when unscoped", () => {
    const relationships = Array.from({ length: 55 }, (_, i) =>
      makeRelationship(`from_${i}`, `to_${i}`, "fk", "pk"),
    );
    const model = makeModel({ name: "big", relationships });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("## Relationships (55)");
    expect(content).toContain("from_0.fk");
    expect(content).toContain("from_49.fk");
    expect(content).not.toContain("from_50.fk");
    expect(content).toContain('*5 more relationships — use `scope: "relationships"` to paginate*');
  });
});

describe("SemanticModelDigest.overview scoped pagination", () => {
  const datasets = Array.from({ length: 80 }, (_, i) =>
    makeDataset({ name: `ds_${i}`, source: `s.p.ds_${i}`, description: `Dataset ${i}` }),
  );
  const relationships = Array.from({ length: 120 }, (_, i) =>
    makeRelationship(`from_${i}`, `to_${i}`, "fk", "pk"),
  );
  const metrics = Array.from({ length: 10 }, (_, i) =>
    makeMetric(`metric_${i}`, `SUM(t.col_${i})`),
  );
  const model = makeModel({ name: "large", datasets, relationships, metrics });

  it("returns datasets scope page 1", () => {
    const result = SemanticModelDigest.overview(model, { scope: "datasets", page: 1 });
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
    expect(result.content).toContain("# large");
    expect(result.content).toContain("## Datasets (80)");
    expect(result.content).toContain("ds_0");
    expect(result.content).toContain("ds_49");
    expect(result.content).not.toContain("ds_50");
    expect(result.content).toContain("*30 more datasets — request page 2*");
    expect(result.content).not.toContain("## Relationships");
    expect(result.content).not.toContain("## Metrics");
  });

  it("returns datasets scope page 2", () => {
    const result = SemanticModelDigest.overview(model, { scope: "datasets", page: 2 });
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.content).toContain("ds_50");
    expect(result.content).toContain("ds_79");
    expect(result.content).not.toContain("ds_49");
    expect(result.content).not.toContain("more datasets");
  });

  it("returns relationships scope with pagination", () => {
    const result = SemanticModelDigest.overview(model, { scope: "relationships", page: 1 });
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.content).toContain("## Relationships (120)");
    expect(result.content).toContain("from_0.fk");
    expect(result.content).toContain("from_49.fk");
    expect(result.content).not.toContain("from_50.fk");
    expect(result.content).toContain("*70 more relationships — request page 2*");
  });

  it("returns metrics scope (single page)", () => {
    const result = SemanticModelDigest.overview(model, { scope: "metrics", page: 1 });
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.content).toContain("## Metrics (10)");
    expect(result.content).toContain("metric_0");
    expect(result.content).toContain("metric_9");
    expect(result.content).not.toContain("more metrics");
  });

  it("clamps out-of-range scoped page", () => {
    const result = SemanticModelDigest.overview(model, { scope: "datasets", page: 99 });
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  it("always includes model header in scoped output", () => {
    const namedModel = makeModel({ name: "mymodel", description: "My description" });
    const result = SemanticModelDigest.overview(namedModel, { scope: "datasets" });
    expect(result.content).toContain("# mymodel");
    expect(result.content).toContain("My description");
  });
});

describe("SemanticModelDigest.dataset", () => {
  const fields60 = Array.from({ length: 60 }, (_, i) =>
    makeField({ name: `field_${i}`, description: `Field ${i}` }),
  );

  it("renders dataset header with source and page info", () => {
    const ds = makeDataset({ name: "orders", source: "shop.public.orders", fields: [makeField({ name: "id" })] });
    const { content } = SemanticModelDigest.dataset(ds);
    expect(content).toContain("# orders (shop.public.orders) — page 1/1");
  });

  it("includes primary key and aliases in metadata line", () => {
    const ds = makeDataset({
      name: "orders",
      source: "s.p.o",
      primary_key: ["id"],
      ai_context: { synonyms: ["purchases", "sales"] },
    });
    const { content } = SemanticModelDigest.dataset(ds);
    expect(content).toContain("PK: id");
    expect(content).toContain("Aliases: purchases, sales");
  });

  it("includes dataset instructions as blockquote", () => {
    const ds = makeDataset({
      name: "orders",
      source: "s.p.o",
      ai_context: { instructions: "Central fact table" },
    });
    const { content } = SemanticModelDigest.dataset(ds);
    expect(content).toContain("> Central fact table");
  });

  it("paginates at 50 fields per page", () => {
    const ds = makeDataset({ name: "wide", source: "s.p.w", fields: fields60 });

    const page1 = SemanticModelDigest.dataset(ds, 1);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(2);
    expect(page1.content).toContain("## Fields (60)");
    expect(page1.content).toContain("**field_0**");
    expect(page1.content).toContain("**field_49**");
    expect(page1.content).not.toContain("**field_50**");
    expect(page1.content).toContain("*10 more fields — request page 2*");

    const page2 = SemanticModelDigest.dataset(ds, 2);
    expect(page2.page).toBe(2);
    expect(page2.content).toContain("**field_50**");
    expect(page2.content).toContain("**field_59**");
    expect(page2.content).not.toContain("more fields");
  });

  it("clamps out-of-range page numbers", () => {
    const ds = makeDataset({ name: "small", source: "s.p.s", fields: [makeField({ name: "id" })] });
    expect(SemanticModelDigest.dataset(ds, 0).page).toBe(1);
    expect(SemanticModelDigest.dataset(ds, 99).page).toBe(1);
  });

  it("handles dataset with zero fields", () => {
    const ds = makeDataset({ name: "empty", source: "s.p.e", fields: [] });
    const { content, totalPages } = SemanticModelDigest.dataset(ds);
    expect(totalPages).toBe(1);
    expect(content).toContain("## Fields (0)");
  });

  it("includes validated queries section when present", () => {
    const ds = makeDataset({
      name: "orders",
      source: "shop.public.orders",
      custom_extensions: [
        {
          vendor_name: "COMMON",
          data: JSON.stringify({
            validated_queries: [
              { description: "Total row count", query: "SELECT COUNT(*) FROM shop.public.orders" },
              { description: "Revenue by month", query: "SELECT DATE_TRUNC('month', ordered_at) AS m, SUM(total_amount) FROM shop.public.orders GROUP BY 1" },
            ],
          }),
        },
      ],
    });
    const { content } = SemanticModelDigest.dataset(ds);
    expect(content).toContain("## Validated Queries (2)");
    expect(content).toContain("1. **Total row count** — `SELECT COUNT(*) FROM shop.public.orders`");
    expect(content).toContain("2. **Revenue by month**");
  });

  it("omits validated queries section when absent", () => {
    const ds = makeDataset({ name: "orders", source: "shop.public.orders" });
    const { content } = SemanticModelDigest.dataset(ds);
    expect(content).not.toContain("Validated Queries");
  });
});

describe("SemanticModelDigest.datasets (batch)", () => {
  const fields20 = Array.from({ length: 20 }, (_, i) =>
    makeField({ name: `f_${i}`, description: `Field ${i}` }),
  );

  it("delegates to dataset() for a single dataset with page param", () => {
    const fields60 = Array.from({ length: 60 }, (_, i) =>
      makeField({ name: `field_${i}`, description: `Field ${i}` }),
    );
    const ds = makeDataset({ name: "orders", source: "s.p.orders", fields: fields60 });
    const batch = SemanticModelDigest.datasets([ds], 2);
    const single = SemanticModelDigest.dataset(ds, 2);
    expect(batch.content).toBe(single.content);
    expect(batch.page).toBe(single.page);
    expect(batch.totalPages).toBe(single.totalPages);
  });

  it("returns page 1 of each dataset separated by delimiters for multiple datasets", () => {
    const ds1 = makeDataset({ name: "orders", source: "s.p.orders", fields: fields20 });
    const ds2 = makeDataset({ name: "customers", source: "s.p.customers", fields: fields20 });
    const result = SemanticModelDigest.datasets([ds1, ds2], 1);
    expect(result.content).toContain("# orders (s.p.orders)");
    expect(result.content).toContain("# customers (s.p.customers)");
    expect(result.content).toContain("\n\n---\n\n");
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("ignores page param when multiple datasets are provided", () => {
    const ds1 = makeDataset({ name: "orders", source: "s.p.orders", fields: fields20 });
    const ds2 = makeDataset({ name: "items", source: "s.p.items", fields: fields20 });
    const resultPage1 = SemanticModelDigest.datasets([ds1, ds2], 1);
    const resultPage5 = SemanticModelDigest.datasets([ds1, ds2], 5);
    expect(resultPage1.content).toBe(resultPage5.content);
  });

  it("returns error message for empty array", () => {
    const result = SemanticModelDigest.datasets([], 1);
    expect(result.content).toBe("No datasets provided.");
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("concatenates three datasets with delimiters", () => {
    const dsList = Array.from({ length: 3 }, (_, i) =>
      makeDataset({ name: `ds_${i}`, source: `s.p.ds_${i}`, fields: [makeField({ name: `id_${i}` })] }),
    );
    const result = SemanticModelDigest.datasets(dsList, 1);
    const sections = result.content.split("\n\n---\n\n");
    expect(sections).toHaveLength(3);
    expect(sections[0]).toContain("# ds_0");
    expect(sections[1]).toContain("# ds_1");
    expect(sections[2]).toContain("# ds_2");
  });
});

describe("parseValidatedQueries", () => {
  it("returns empty array for undefined extensions", () => {
    expect(parseValidatedQueries(undefined)).toEqual([]);
  });

  it("returns empty array when no COMMON extension exists", () => {
    expect(parseValidatedQueries([{ vendor_name: "DBT", data: "{}" }])).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseValidatedQueries([{ vendor_name: "COMMON", data: "not-json" }])).toEqual([]);
  });

  it("returns empty array when validated_queries is not an array", () => {
    expect(
      parseValidatedQueries([{ vendor_name: "COMMON", data: '{"validated_queries":"nope"}' }]),
    ).toEqual([]);
  });

  it("parses valid validated queries", () => {
    const queries = parseValidatedQueries([
      {
        vendor_name: "COMMON",
        data: JSON.stringify({
          validated_queries: [
            { description: "Count all", query: "SELECT COUNT(*) FROM t" },
          ],
        }),
      },
    ]);
    expect(queries).toEqual([{ description: "Count all", query: "SELECT COUNT(*) FROM t" }]);
  });

  it("filters out entries with missing fields", () => {
    const queries = parseValidatedQueries([
      {
        vendor_name: "COMMON",
        data: JSON.stringify({
          validated_queries: [
            { description: "Valid", query: "SELECT 1" },
            { description: 123, query: "SELECT 2" },
            { description: "No query" },
          ],
        }),
      },
    ]);
    expect(queries).toHaveLength(1);
    expect(queries[0].description).toBe("Valid");
  });
});

describe("SemanticModelDigest.overview validated queries", () => {
  it("includes validated queries section when model has queries", () => {
    const model = makeModel({
      name: "ecommerce",
      custom_extensions: [
        {
          vendor_name: "COMMON",
          data: JSON.stringify({
            validated_queries: [
              { description: "Top customers", query: "SELECT c.email, SUM(o.total) FROM orders o JOIN customers c ON o.cid = c.id GROUP BY 1 ORDER BY 2 DESC LIMIT 10" },
            ],
          }),
        },
      ],
    });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).toContain("## Validated Queries (1)");
    expect(content).toContain("1. **Top customers** — `SELECT c.email");
  });

  it("omits validated queries section when model has no queries", () => {
    const model = makeModel({ name: "empty" });
    const { content } = SemanticModelDigest.overview(model);
    expect(content).not.toContain("Validated Queries");
  });
});

describe("SemanticModelDigest custom itemsPerPage", () => {
  it("exports DEFAULT_ITEMS_PER_PAGE as 50", () => {
    expect(DEFAULT_ITEMS_PER_PAGE).toBe(50);
  });

  it("overview respects custom itemsPerPage for unscoped truncation", () => {
    const datasets = Array.from({ length: 30 }, (_, i) =>
      makeDataset({ name: `ds_${i}`, source: `s.p.ds_${i}` }),
    );
    const model = makeModel({ name: "custom", datasets });

    const defaultResult = SemanticModelDigest.overview(model);
    expect(defaultResult.content).not.toContain("more datasets");

    const customResult = SemanticModelDigest.overview(model, { itemsPerPage: 10 });
    expect(customResult.content).toContain("ds_0");
    expect(customResult.content).toContain("ds_9");
    expect(customResult.content).not.toContain("ds_10");
    expect(customResult.content).toContain('*20 more datasets — use `scope: "datasets"` to paginate*');
  });

  it("overview respects custom itemsPerPage for scoped pagination", () => {
    const datasets = Array.from({ length: 25 }, (_, i) =>
      makeDataset({ name: `ds_${i}`, source: `s.p.ds_${i}` }),
    );
    const model = makeModel({ name: "custom", datasets });

    const page1 = SemanticModelDigest.overview(model, { scope: "datasets", page: 1, itemsPerPage: 10 });
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(3);
    expect(page1.content).toContain("ds_0");
    expect(page1.content).toContain("ds_9");
    expect(page1.content).not.toContain("ds_10");
    expect(page1.content).toContain("*15 more datasets — request page 2*");

    const page3 = SemanticModelDigest.overview(model, { scope: "datasets", page: 3, itemsPerPage: 10 });
    expect(page3.page).toBe(3);
    expect(page3.content).toContain("ds_20");
    expect(page3.content).toContain("ds_24");
    expect(page3.content).not.toContain("more datasets");
  });

  it("dataset respects custom itemsPerPage", () => {
    const fields = Array.from({ length: 35 }, (_, i) =>
      makeField({ name: `f_${i}`, description: `Field ${i}` }),
    );
    const ds = makeDataset({ name: "wide", source: "s.p.w", fields });

    const page1 = SemanticModelDigest.dataset(ds, 1, 15);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(3);
    expect(page1.content).toContain("**f_0**");
    expect(page1.content).toContain("**f_14**");
    expect(page1.content).not.toContain("**f_15**");
    expect(page1.content).toContain("*20 more fields — request page 2*");

    const page3 = SemanticModelDigest.dataset(ds, 3, 15);
    expect(page3.page).toBe(3);
    expect(page3.content).toContain("**f_30**");
    expect(page3.content).toContain("**f_34**");
    expect(page3.content).not.toContain("more fields");
  });
});
