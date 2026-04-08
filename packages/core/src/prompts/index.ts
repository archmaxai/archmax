import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsDir = resolve(__dirname, "../../prompts");

export const SEMANTIC_MODEL_AGENT_PROMPT = readFileSync(
  resolve(promptsDir, "semantic-model-agent.md"),
  "utf-8",
);
