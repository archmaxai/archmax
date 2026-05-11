import { describe, it, expect } from "vitest";
import {
  customExtensionSchema,
  datasetSchema,
  extractViewQuery,
  setViewQueryOnExtensions,
} from "./semantic-model-schema";

describe("customExtensionSchema — view_query inside COMMON", () => {
  it("accepts a COMMON extension with a non-empty view_query", () => {
    const ext = {
      vendor_name: "COMMON",
      data: '{"view_query":"SELECT id FROM shop.public.orders"}',
    };
    const result = customExtensionSchema.safeParse(ext);
    expect(result.success).toBe(true);
  });

  it("accepts a COMMON extension whose view_query spans multiple lines with comments and whitespace", () => {
    const sql = `-- pull only active orders
SELECT
  /* logical id */ id   AS "order_id",
  total_amount,
  status
FROM shop.public.orders
WHERE deleted_at IS NULL`;
    const ext = {
      vendor_name: "COMMON",
      data: JSON.stringify({ view_query: sql }),
    };
    const result = customExtensionSchema.safeParse(ext);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(JSON.parse(result.data.data).view_query).toContain("WHERE deleted_at IS NULL");
    }
  });

  it("rejects a COMMON extension with an empty view_query", () => {
    const ext = {
      vendor_name: "COMMON",
      data: '{"view_query":""}',
    };
    const result = customExtensionSchema.safeParse(ext);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join("\n");
      expect(messages.toLowerCase()).toMatch(/at least 1|too small|min/);
    }
  });

  it("ignores view_query validation for non-COMMON vendor extensions", () => {
    const ext = {
      vendor_name: "tableau",
      data: '{"view_query":""}',
    };
    const result = customExtensionSchema.safeParse(ext);
    expect(result.success).toBe(true);
  });

  it("preserves coexisting COMMON keys (validated_queries, data_type, view_query)", () => {
    const ext = {
      vendor_name: "COMMON",
      data: JSON.stringify({
        view_query: "SELECT id FROM shop.public.orders",
        validated_queries: [{ description: "count orders", query: "SELECT COUNT(*) FROM orders" }],
        data_type: "INTEGER",
      }),
    };
    const result = customExtensionSchema.safeParse(ext);
    expect(result.success).toBe(true);
  });
});

describe("datasetSchema round-trip with view_query", () => {
  it("parses a dataset YAML carrying view_query inside its COMMON extension", () => {
    const yaml = {
      name: "orders",
      source: "shop.public.orders",
      fields: [],
      custom_extensions: [
        {
          vendor_name: "COMMON",
          data: '{"view_query":"SELECT id FROM shop.public.orders"}',
        },
      ],
    };
    const result = datasetSchema.safeParse(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(extractViewQuery(result.data)).toBe("SELECT id FROM shop.public.orders");
    }
  });
});

describe("extractViewQuery", () => {
  it("returns null when no COMMON extension is present", () => {
    expect(extractViewQuery({ custom_extensions: [] })).toBeNull();
  });

  it("returns null when the COMMON extension has no view_query key", () => {
    expect(
      extractViewQuery({
        custom_extensions: [
          { vendor_name: "COMMON", data: '{"data_type":"INTEGER"}' },
        ],
      }),
    ).toBeNull();
  });

  it("returns the view_query string when present", () => {
    expect(
      extractViewQuery({
        custom_extensions: [
          {
            vendor_name: "COMMON",
            data: '{"view_query":"SELECT 1","data_type":"INTEGER"}',
          },
        ],
      }),
    ).toBe("SELECT 1");
  });

  it("returns null when the COMMON extension data is unparsable JSON", () => {
    expect(
      extractViewQuery({
        custom_extensions: [{ vendor_name: "COMMON", data: "{not json" }],
      }),
    ).toBeNull();
  });
});

describe("setViewQueryOnExtensions", () => {
  it("creates a COMMON extension when none exists", () => {
    const next = setViewQueryOnExtensions([], "SELECT 1");
    expect(next).toHaveLength(1);
    expect(next[0].vendor_name).toBe("COMMON");
    expect(JSON.parse(next[0].data)).toEqual({ view_query: "SELECT 1" });
  });

  it("merges into the existing COMMON extension without dropping siblings", () => {
    const next = setViewQueryOnExtensions(
      [
        {
          vendor_name: "COMMON",
          data: JSON.stringify({ data_type: "INTEGER", graph_x: 100 }),
        },
      ],
      "SELECT 1",
    );
    expect(next).toHaveLength(1);
    const data = JSON.parse(next[0].data);
    expect(data).toEqual({ data_type: "INTEGER", graph_x: 100, view_query: "SELECT 1" });
  });

  it("removes view_query when set to null and keeps the rest of COMMON", () => {
    const next = setViewQueryOnExtensions(
      [
        {
          vendor_name: "COMMON",
          data: JSON.stringify({ view_query: "SELECT 1", data_type: "INTEGER" }),
        },
      ],
      null,
    );
    expect(next).toHaveLength(1);
    expect(JSON.parse(next[0].data)).toEqual({ data_type: "INTEGER" });
  });

  it("removes the COMMON extension entirely when its only key was view_query", () => {
    const next = setViewQueryOnExtensions(
      [
        {
          vendor_name: "COMMON",
          data: JSON.stringify({ view_query: "SELECT 1" }),
        },
      ],
      null,
    );
    expect(next).toHaveLength(0);
  });

  it("does not touch non-COMMON extensions", () => {
    const tableau = { vendor_name: "tableau", data: '{"foo":"bar"}' };
    const next = setViewQueryOnExtensions([tableau], "SELECT 1");
    expect(next).toContainEqual(tableau);
  });
});
