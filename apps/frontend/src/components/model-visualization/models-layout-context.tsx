import { createContext, useContext } from "react";

interface ModelsLayoutContextValue {
  onStreamEnd?: () => void;
  selectedModel?: string | null;
}

const ModelsLayoutContext = createContext<ModelsLayoutContextValue>({});

export const ModelsLayoutProvider = ModelsLayoutContext.Provider;

export function useModelsLayout(): ModelsLayoutContextValue {
  return useContext(ModelsLayoutContext);
}
