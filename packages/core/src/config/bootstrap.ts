import { config } from "dotenv";
import { isAbsolute, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

if (process.env.ARCHSEM_DATA_DIR && !process.env.ARCHMAX_DATA_DIR) {
  console.warn("[config] ARCHSEM_DATA_DIR is deprecated — use ARCHMAX_DATA_DIR instead");
  process.env.ARCHMAX_DATA_DIR = process.env.ARCHSEM_DATA_DIR;
}

if (process.env.SEMLAYER_DATA_DIR && !process.env.ARCHMAX_DATA_DIR) {
  console.warn("[config] SEMLAYER_DATA_DIR is deprecated — use ARCHMAX_DATA_DIR instead");
  process.env.ARCHMAX_DATA_DIR = process.env.SEMLAYER_DATA_DIR;
}

if (!process.env.ARCHMAX_DATA_DIR) {
  process.env.ARCHMAX_DATA_DIR = resolve(root, "data/projects");
} else if (!isAbsolute(process.env.ARCHMAX_DATA_DIR)) {
  process.env.ARCHMAX_DATA_DIR = resolve(root, process.env.ARCHMAX_DATA_DIR);
}
