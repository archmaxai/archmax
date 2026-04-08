## 1. Type updates
- [ ] 1.1 Extend `DatasetFull` in `types.ts` with `primary_key`, `unique_keys`, `ai_context` fields
- [ ] 1.2 Add `parseValidatedQueries` and `parseAiContext` helpers to `types.ts`

## 2. Dataset detail sheet component
- [ ] 2.1 Create `dataset-detail-sheet.tsx` with a Sheet (right slide-out panel)
- [ ] 2.2 Render header section: dataset name + source
- [ ] 2.3 Render AI context section: description, instructions, synonyms, examples
- [ ] 2.4 Render key info section: primary key, unique keys
- [ ] 2.5 Render validated queries section: numbered list with description + SQL code block
- [ ] 2.6 Render fields section: scrollable list with name, type, description, expression
- [ ] 2.7 Render connected relationships section: filtered from parent model

## 3. Wire into graph view
- [ ] 3.1 Add `onNodeClick` handler to `ModelGraphView` that opens the sheet for the clicked dataset
- [ ] 3.2 Pass the full model (for relationships context) and selected dataset to the sheet
- [ ] 3.3 Ensure node drag does not trigger the sheet (only click without drag)
