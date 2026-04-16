## 1. Schema Changes

- [x] 1.1 Add `jsonStringSchema` (reusable Zod refined string that must parse as JSON) to `semantic-model-schema.ts`
- [x] 1.2 Replace `data: z.string()` with `data: jsonStringSchema` in `customExtensionSchema`
- [x] 1.3 Export `jsonStringSchema` so future JSON-in-string fields can reuse it

## 2. Service-Layer Validation

- [x] 2.1 Add JSON validation in `updateModelExtensions()` before writing (throws descriptive error on invalid JSON in `data`)
- [x] 2.2 Add JSON validation in `updateDatasetExtensions()` before writing (same pattern)

## 3. Tests

- [x] 3.1 Add schema-level tests: `customExtensionSchema` rejects invalid JSON in `data`, accepts valid JSON
- [x] 3.2 Add service-level tests: `updateModelExtensions` / `updateDatasetExtensions` reject invalid JSON before writing
- [x] 3.3 Verify existing tests still pass (no regressions from tightened schema)
