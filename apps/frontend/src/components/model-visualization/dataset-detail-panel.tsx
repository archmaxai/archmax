import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { AiContext, DatasetFull } from "./types";
import { getAiContextObject, getAiInstructions, getFieldDataType } from "./types";
import { useUpdateDatasetMetadata, type DatasetMetadataPatch } from "./use-dataset-metadata";

interface DatasetDetailPanelProps {
  projectId: string;
  modelName: string;
  dataset: DatasetFull;
  onClose: () => void;
  className?: string;
}

function initFieldDescriptions(ds: DatasetFull): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ds.fields) out[f.name] = f.description ?? "";
  return out;
}

/**
 * Build an `ai_context` payload that preserves any existing synonyms/examples
 * while updating the editable `instructions`. Returns "" to clear the context
 * entirely when nothing meaningful remains.
 */
function buildAiContext(original: AiContext | undefined, instructions: string): AiContext {
  const obj = getAiContextObject(original);
  const next = { ...obj, instructions: instructions.trim() || undefined };
  if (!next.instructions) delete next.instructions;
  const hasSynonyms = !!next.synonyms && next.synonyms.length > 0;
  const hasExamples = !!next.examples && next.examples.length > 0;
  if (!next.instructions && !hasSynonyms && !hasExamples) return "";
  return next;
}

export function DatasetDetailPanel({
  projectId,
  modelName,
  dataset,
  onClose,
  className,
}: DatasetDetailPanelProps) {
  const baselineDescription = dataset.description ?? "";
  const baselineInstructions = getAiInstructions(dataset.ai_context);
  const baselineFields = useMemo(() => initFieldDescriptions(dataset), [dataset]);

  const [description, setDescription] = useState(baselineDescription);
  const [aiInstructions, setAiInstructions] = useState(baselineInstructions);
  const [fieldDescriptions, setFieldDescriptions] = useState<Record<string, string>>(baselineFields);

  // Reset editor state when switching to a different dataset.
  const lastName = useRef(dataset.name);
  useEffect(() => {
    if (lastName.current !== dataset.name) {
      lastName.current = dataset.name;
      setDescription(dataset.description ?? "");
      setAiInstructions(getAiInstructions(dataset.ai_context));
      setFieldDescriptions(initFieldDescriptions(dataset));
    }
  }, [dataset]);

  const mutation = useUpdateDatasetMetadata(projectId, modelName);

  const dirty =
    description !== baselineDescription ||
    aiInstructions !== baselineInstructions ||
    Object.keys(baselineFields).some((name) => (fieldDescriptions[name] ?? "") !== baselineFields[name]);

  const handleSave = useCallback(() => {
    const patch: DatasetMetadataPatch = {};
    if (description !== baselineDescription) patch.description = description;
    if (aiInstructions !== baselineInstructions) {
      patch.ai_context = buildAiContext(dataset.ai_context, aiInstructions);
    }
    const changedFields = dataset.fields
      .filter((f) => (fieldDescriptions[f.name] ?? "") !== (f.description ?? ""))
      .map((f) => ({ name: f.name, description: fieldDescriptions[f.name] ?? "" }));
    if (changedFields.length > 0) patch.fields = changedFields;
    if (Object.keys(patch).length === 0) return;
    mutation.mutate({ datasetName: dataset.name, patch });
  }, [
    description,
    baselineDescription,
    aiInstructions,
    baselineInstructions,
    fieldDescriptions,
    dataset,
    mutation,
  ]);

  const aiObj = getAiContextObject(dataset.ai_context);

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
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-5 p-4">
          <section className="space-y-1.5">
            <Label htmlFor="dataset-description">Description</Label>
            <Textarea
              id="dataset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summarize what this dataset represents…"
              rows={3}
            />
          </section>

          <section className="space-y-1.5">
            <Label htmlFor="dataset-ai-context">AI description</Label>
            <Textarea
              id="dataset-ai-context"
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="Guidance for AI agents using this dataset…"
              rows={4}
            />
            {(aiObj.synonyms?.length || aiObj.examples?.length) ? (
              <div className="space-y-1 pt-1 text-xs text-muted-foreground">
                {aiObj.synonyms && aiObj.synonyms.length > 0 && (
                  <p>
                    <span className="font-medium">Synonyms: </span>
                    {aiObj.synonyms.join(", ")}
                  </p>
                )}
                {aiObj.examples && aiObj.examples.length > 0 && (
                  <p>
                    <span className="font-medium">Examples: </span>
                    {aiObj.examples.join(", ")}
                  </p>
                )}
              </div>
            ) : null}
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
                        value={fieldDescriptions[field.name] ?? ""}
                        onChange={(e) =>
                          setFieldDescriptions((prev) => ({ ...prev, [field.name]: e.target.value }))
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

      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
