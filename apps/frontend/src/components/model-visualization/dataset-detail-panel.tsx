import { useCallback, useEffect, useRef, useState } from "react";
import { X, Save, Loader2, Database } from "lucide-react";
import {
  Button,
  Textarea,
  Label,
  Badge,
  Separator,
  ScrollArea,
  cn,
} from "@archmax/ui";
import type { AiContext, AiContextObject, DatasetFull } from "./types";
import { getAiContextObject, getFieldDataType } from "./types";
import { useUpdateDatasetMetadata, type DatasetMetadataPatch } from "./use-dataset-metadata";

interface DatasetDetailPanelProps {
  projectId: string;
  modelName: string;
  dataset: DatasetFull;
  onClose: () => void;
  className?: string;
}

interface EditState {
  description: string;
  aiInstructions: string;
  /** Synonyms/examples are edited as one entry per line. */
  synonymsText: string;
  examplesText: string;
  fieldDescriptions: Record<string, string>;
}

/** Parse a one-per-line editor value into a trimmed, non-empty list. */
function parseList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function listEqual(a: string, b: string): boolean {
  const pa = parseList(a);
  const pb = parseList(b);
  return pa.length === pb.length && pa.every((v, i) => v === pb[i]);
}

function deriveState(ds: DatasetFull): EditState {
  const fieldDescriptions: Record<string, string> = {};
  for (const f of ds.fields) fieldDescriptions[f.name] = f.description ?? "";
  const ai = getAiContextObject(ds.ai_context);
  return {
    description: ds.description ?? "",
    aiInstructions: ai.instructions ?? "",
    synonymsText: (ai.synonyms ?? []).join("\n"),
    examplesText: (ai.examples ?? []).join("\n"),
    fieldDescriptions,
  };
}

/**
 * Merge a fresh on-disk snapshot into the working editor state, preserving
 * fields the user has actively edited (where `current` diverges from the
 * previous `baseline`) while refreshing untouched fields to their latest
 * persisted value. This keeps the panel in sync with background refetches
 * without clobbering in-progress edits.
 */
function resyncUntouched(current: EditState, baseline: EditState, next: EditState): EditState {
  const fieldDescriptions: Record<string, string> = {};
  for (const name of Object.keys(next.fieldDescriptions)) {
    const cur = current.fieldDescriptions[name] ?? "";
    const base = baseline.fieldDescriptions[name] ?? "";
    fieldDescriptions[name] = cur !== base ? cur : next.fieldDescriptions[name];
  }
  return {
    description: current.description !== baseline.description ? current.description : next.description,
    aiInstructions:
      current.aiInstructions !== baseline.aiInstructions ? current.aiInstructions : next.aiInstructions,
    synonymsText: !listEqual(current.synonymsText, baseline.synonymsText)
      ? current.synonymsText
      : next.synonymsText,
    examplesText: !listEqual(current.examplesText, baseline.examplesText)
      ? current.examplesText
      : next.examplesText,
    fieldDescriptions,
  };
}

function isAiDirty(edit: EditState, baseline: EditState): boolean {
  return (
    edit.aiInstructions !== baseline.aiInstructions ||
    !listEqual(edit.synonymsText, baseline.synonymsText) ||
    !listEqual(edit.examplesText, baseline.examplesText)
  );
}

function isDirty(edit: EditState, baseline: EditState): boolean {
  if (edit.description !== baseline.description) return true;
  if (isAiDirty(edit, baseline)) return true;
  return Object.keys(baseline.fieldDescriptions).some(
    (name) => (edit.fieldDescriptions[name] ?? "") !== baseline.fieldDescriptions[name],
  );
}

/**
 * Build an `ai_context` payload from the editable instructions, synonyms, and
 * examples. Returns "" to clear the context entirely when nothing remains.
 */
function buildAiContext(edit: EditState): AiContext {
  const next: AiContextObject = {};
  const instructions = edit.aiInstructions.trim();
  const synonyms = parseList(edit.synonymsText);
  const examples = parseList(edit.examplesText);
  if (instructions) next.instructions = instructions;
  if (synonyms.length > 0) next.synonyms = synonyms;
  if (examples.length > 0) next.examples = examples;
  if (!next.instructions && !next.synonyms && !next.examples) return "";
  return next;
}

export function DatasetDetailPanel({
  projectId,
  modelName,
  dataset,
  onClose,
  className,
}: DatasetDetailPanelProps) {
  const [baseline, setBaseline] = useState<EditState>(() => deriveState(dataset));
  const [edit, setEdit] = useState<EditState>(baseline);
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  const lastNameRef = useRef(dataset.name);

  // Keep the editor in sync with the latest `dataset` prop. Switching datasets
  // fully resets; a background refetch of the same dataset refreshes the
  // baseline and any untouched fields while preserving in-progress edits.
  useEffect(() => {
    const next = deriveState(dataset);
    if (lastNameRef.current !== dataset.name) {
      lastNameRef.current = dataset.name;
      setBaseline(next);
      setEdit(next);
      return;
    }
    setEdit((cur) => resyncUntouched(cur, baselineRef.current, next));
    setBaseline(next);
  }, [dataset]);

  const mutation = useUpdateDatasetMetadata(projectId, modelName);

  const dirty = isDirty(edit, baseline);

  const handleSave = useCallback(() => {
    const patch: DatasetMetadataPatch = {};
    if (edit.description !== baseline.description) patch.description = edit.description;
    if (isAiDirty(edit, baseline)) {
      patch.ai_context = buildAiContext(edit);
    }
    const changedFields = Object.keys(baseline.fieldDescriptions)
      .filter((name) => (edit.fieldDescriptions[name] ?? "") !== baseline.fieldDescriptions[name])
      .map((name) => ({ name, description: edit.fieldDescriptions[name] ?? "" }));
    if (changedFields.length > 0) patch.fields = changedFields;
    if (Object.keys(patch).length === 0) return;
    mutation.mutate({ datasetName: dataset.name, patch });
  }, [edit, baseline, dataset, mutation]);

  return (
    <div className={cn("flex h-full flex-col bg-muted", className)}>
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-sm font-medium">{dataset.name}</h2>
          </div>
          <p className="truncate text-xs text-muted-foreground" title={dataset.source}>
            {dataset.source}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handleSave}
            disabled={!dirty || mutation.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background transition-colors hover:bg-foreground/80 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close panel">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-5 p-4">
          <section className="space-y-1.5">
            <Label htmlFor="dataset-description">Description</Label>
            <Textarea
              id="dataset-description"
              value={edit.description}
              onChange={(e) => setEdit((cur) => ({ ...cur, description: e.target.value }))}
              placeholder="Summarize what this dataset represents…"
              rows={3}
              className="text-xs"
            />
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="dataset-ai-context">AI description</Label>
            <Textarea
              id="dataset-ai-context"
              value={edit.aiInstructions}
              onChange={(e) => setEdit((cur) => ({ ...cur, aiInstructions: e.target.value }))}
              placeholder="Guidance for AI agents using this dataset…"
              rows={4}
              className="text-xs"
            />
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="dataset-synonyms">Synonyms</Label>
            <Textarea
              id="dataset-synonyms"
              value={edit.synonymsText}
              onChange={(e) => setEdit((cur) => ({ ...cur, synonymsText: e.target.value }))}
              placeholder="One synonym per line…"
              rows={2}
              className="text-xs"
            />
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="dataset-examples">Examples</Label>
            <Textarea
              id="dataset-examples"
              value={edit.examplesText}
              onChange={(e) => setEdit((cur) => ({ ...cur, examplesText: e.target.value }))}
              placeholder="One example per line…"
              rows={2}
              className="text-xs"
            />
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Fields</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{dataset.fields.length}</span>
            </div>
            {dataset.fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">This dataset has no fields.</p>
            ) : (
              <div className="space-y-3">
                {dataset.fields.map((field) => {
                  const dataType = getFieldDataType(field);
                  return (
                    <div key={field.name} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs font-medium">{field.name}</span>
                        {dataType && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {dataType}
                          </Badge>
                        )}
                      </div>
                      <Textarea
                        value={edit.fieldDescriptions[field.name] ?? ""}
                        onChange={(e) =>
                          setEdit((cur) => ({
                            ...cur,
                            fieldDescriptions: { ...cur.fieldDescriptions, [field.name]: e.target.value },
                          }))
                        }
                        placeholder="Describe this field…"
                        rows={2}
                        className="mt-2 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
