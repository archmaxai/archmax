import { config } from "dotenv";
import { isAbsolute, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

// Resolve SEMLAYER_DATA_DIR relative to monorepo root, not process.cwd()
if (!process.env.SEMLAYER_DATA_DIR) {
  process.env.SEMLAYER_DATA_DIR = resolve(root, "data/projects");
} else if (!isAbsolute(process.env.SEMLAYER_DATA_DIR)) {
  process.env.SEMLAYER_DATA_DIR = resolve(root, process.env.SEMLAYER_DATA_DIR);
}
