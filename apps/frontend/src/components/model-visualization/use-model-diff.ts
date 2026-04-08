import { useRef, useState, useEffect, useCallback } from "react";
import type { SemanticModelFull, ModelDiff } from "./types";

const EMPTY_DIFF: ModelDiff = {
  addedDatasets: new Set(),
  removedDatasets: new Set(),
  modifiedDatasets: new Set(),
  addedMetrics: new Set(),
  removedMetrics: new Set(),
  modifiedMetrics: new Set(),
  addedRelationships: new Set(),
  removedRelationships: new Set(),
  modifiedFields: new Map(),
};

function computeDiff(
  prev: SemanticModelFull | null,
  next: SemanticModelFull | null,
): ModelDiff {
  if (!prev || !next) return EMPTY_DIFF;

  const diff: ModelDiff = {
    addedDatasets: new Set(),
    removedDatasets: new Set(),
    modifiedDatasets: new Set(),
    addedMetrics: new Set(),
    removedMetrics: new Set(),
    modifiedMetrics: new Set(),
    addedRelationships: new Set(),
    removedRelationships: new Set(),
    modifiedFields: new Map(),
  };

  const prevDs = new Map(prev.datasets.map((d) => [d.name, d]));
  const nextDs = new Map(next.datasets.map((d) => [d.name, d]));

  for (const name of nextDs.keys()) {
    if (!prevDs.has(name)) {
      diff.addedDatasets.add(name);
    } else {
      const p = prevDs.get(name)!;
      const n = nextDs.get(name)!;
      const prevFields = new Map(p.fields.map((f) => [f.name, JSON.stringify(f)]));
      const changedFields = new Set<string>();
      for (const f of n.fields) {
        const pf = prevFields.get(f.name);
        if (!pf) changedFields.add(f.name);
        else if (pf !== JSON.stringify(f)) changedFields.add(f.name);
      }
      if (changedFields.size > 0) {
        diff.modifiedDatasets.add(name);
        diff.modifiedFields.set(name, changedFields);
      }
    }
  }
  for (const name of prevDs.keys()) {
    if (!nextDs.has(name)) diff.removedDatasets.add(name);
  }

  const prevMetrics = new Map(prev.metrics.map((m) => [m.name, JSON.stringify(m)]));
  for (const m of next.metrics) {
    const pm = prevMetrics.get(m.name);
    if (!pm) diff.addedMetrics.add(m.name);
    else if (pm !== JSON.stringify(m)) diff.modifiedMetrics.add(m.name);
  }
  for (const name of prevMetrics.keys()) {
    if (!next.metrics.some((m) => m.name === name)) diff.removedMetrics.add(name);
  }

  const prevRels = new Map(prev.relationships.map((r) => [r.name, JSON.stringify(r)]));
  for (const r of next.relationships) {
    if (!prevRels.has(r.name)) diff.addedRelationships.add(r.name);
  }
  for (const name of prevRels.keys()) {
    if (!next.relationships.some((r) => r.name === name)) diff.removedRelationships.add(name);
  }

  return diff;
}

function isDiffEmpty(d: ModelDiff): boolean {
  return (
    d.addedDatasets.size === 0 &&
    d.removedDatasets.size === 0 &&
    d.modifiedDatasets.size === 0 &&
    d.addedMetrics.size === 0 &&
    d.removedMetrics.size === 0 &&
    d.modifiedMetrics.size === 0 &&
    d.addedRelationships.size === 0 &&
    d.removedRelationships.size === 0 &&
    d.modifiedFields.size === 0
  );
}

const FADE_DURATION = 5000;

export function useModelDiff(model: SemanticModelFull | null): ModelDiff {
  const prevRef = useRef<SemanticModelFull | null>(null);
  const [diff, setDiff] = useState<ModelDiff>(EMPTY_DIFF);

  const onModelUpdate = useCallback((newModel: SemanticModelFull | null) => {
    if (!newModel) return;
    const d = computeDiff(prevRef.current, newModel);
    prevRef.current = newModel;
    if (isDiffEmpty(d)) return;
    setDiff(d);
  }, []);

  useEffect(() => {
    onModelUpdate(model);
  }, [model, onModelUpdate]);

  useEffect(() => {
    if (isDiffEmpty(diff)) return;
    const timer = setTimeout(() => setDiff(EMPTY_DIFF), FADE_DURATION);
    return () => clearTimeout(timer);
  }, [diff]);

  return diff;
}
