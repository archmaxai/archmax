## 1. Frontend Implementation

- [x] 1.1 Update `model-visualization.tsx` to center the pill tabs (replace `justify-between` + empty left div with a 3-column grid or flex layout that centers the pills)
- [x] 1.2 Add a download button to the right side of the toolbar row (beside the pills) using a `Download` lucide icon with ghost/subtle styling
- [x] 1.3 Implement the download handler: fetch from `GET /api/projects/:projectId/semantic-models/:name/yaml`, create a Blob, and trigger a browser download as `<modelName>.yaml`

## 2. Verification

- [x] 2.1 Run `pnpm typecheck` and `pnpm lint` to verify no regressions
