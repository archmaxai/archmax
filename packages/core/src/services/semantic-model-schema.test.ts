import { describe, it, expect } from "vitest";
import { aiContextSchema, customExtensionSchema, jsonStringSchema } from "./semantic-model-schema";

describe("jsonStringSchema", () => {
  it("accepts valid JSON object", () => {
    expect(() => jsonStringSchema.parse('{"key":"value"}')).not.toThrow();
  });

  it("accepts valid JSON array", () => {
    expect(() => jsonStringSchema.parse('[1,2,3]')).not.toThrow();
  });

  it("accepts empty JSON object", () => {
    expect(() => jsonStringSchema.parse("{}")).not.toThrow();
  });

  it("accepts JSON string literal", () => {
    expect(() => jsonStringSchema.parse('"hello"')).not.toThrow();
  });

  it("accepts JSON number literal", () => {
    expect(() => jsonStringSchema.parse("42")).not.toThrow();
  });

  it("rejects plain text", () => {
    expect(() => jsonStringSchema.parse("not-json")).toThrow();
  });

  it("rejects truncated JSON", () => {
    expect(() => jsonStringSchema.parse('{"broken')).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => jsonStringSchema.parse("")).toThrow();
  });
});

describe("customExtensionSchema", () => {
  it("accepts extension with valid JSON data", () => {
    const result = customExtensionSchema.parse({
      vendor_name: "COMMON",
      data: '{"data_type":"VARCHAR","example_data":["Active"]}',
    });
    expect(result.vendor_name).toBe("COMMON");
  });

  it("rejects extension with invalid JSON data", () => {
    expect(() =>
      customExtensionSchema.parse({
        vendor_name: "COMMON",
        data: "not valid json{",
      }),
    ).toThrow();
  });

  it("rejects extension with empty data string", () => {
    expect(() =>
      customExtensionSchema.parse({
        vendor_name: "COMMON",
        data: "",
      }),
    ).toThrow();
  });
});

describe("aiContextSchema – YAML colon coercion", () => {
  it("coerces an object in examples back to a string (YAML `: ` footgun)", () => {
    const input = {
      instructions: "test",
      examples: [
        "How many orders?",
        { filter: "vendor LIKE steelcase" },
        "What is the revenue?",
      ],
    };
    const result = aiContextSchema.parse(input);
    expect(result).toEqual({
      instructions: "test",
      examples: [
        "How many orders?",
        "filter: vendor LIKE steelcase",
        "What is the revenue?",
      ],
    });
  });

  it("coerces an object in synonyms back to a string", () => {
    const input = { synonyms: ["revenue", { Umsatz: "total" }] };
    const result = aiContextSchema.parse(input);
    expect(result!.synonyms![0]).toBe("revenue");
    expect(typeof result!.synonyms![1]).toBe("string");
  });

  it("passes through normal string arrays unchanged", () => {
    const input = { examples: ["a", "b", "c"] };
    const result = aiContextSchema.parse(input);
    expect(result).toEqual({ examples: ["a", "b", "c"] });
  });

  it("still accepts a plain string ai_context", () => {
    expect(aiContextSchema.parse("just a string")).toBe("just a string");
  });
});
