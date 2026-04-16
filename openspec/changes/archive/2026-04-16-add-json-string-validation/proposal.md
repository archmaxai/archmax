# Change: Validate JSON strings embedded in YAML before writing to disk

## Why

`custom_extensions[].data` is typed as `z.string()` and conventionally contains JSON, but no validation ensures the string is actually valid JSON before it reaches the filesystem. Malformed JSON silently persists in YAML files and is only discovered at read time — when `JSON.parse` fails inside try/catch blocks and returns `null` or `[]`, discarding the data without surfacing the root cause. Catching invalid JSON at the write boundary prevents corrupt data from reaching disk.

## What Changes

- Introduce a reusable `jsonStringSchema` Zod refinement (`z.string().check(...)`) that validates a string parses as JSON
- Replace `z.string()` with `jsonStringSchema` on `customExtensionSchema.data`
- Add JSON validation in `SemanticModelFileService.updateModelExtensions()` and `updateDatasetExtensions()` which bypass Zod and write raw extensions directly
- Add unit tests for the new validation at both the schema and service layers

## Impact

- Affected specs: `semantic-models` (modifies Zod Schema Validation and Custom Extensions on All Entities)
- Affected code: `packages/core/src/services/semantic-model-schema.ts`, `packages/core/src/services/semantic-model-files.ts`, associated tests
