# Change: Add download button for assembled semantic model YAML

## Why

Users viewing a semantic model in the admin UI have no way to download the full assembled YAML file. The YAML tab shows the content read-only, but there is no export action. A download button lets users save the assembled build YAML locally for sharing, version control, or offline review.

## What Changes

- Add a download button to the model visualization toolbar, placed to the right of the pill tabs (Graph / Tree / YAML)
- Center the pill tabs horizontally in the toolbar (currently right-aligned with an empty left spacer)
- The download triggers a browser file save of the full assembled YAML from the existing `GET /api/projects/:projectId/semantic-models/:name/yaml` endpoint
- The downloaded file is named `<modelName>.yaml`

## Impact

- Affected specs: `semantic-models`
- Affected code: `apps/frontend/src/components/model-visualization/model-visualization.tsx`
- No API changes needed (existing `/yaml` endpoint already returns the assembled content as plain text)
