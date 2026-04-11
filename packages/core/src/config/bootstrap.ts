import { config } from "dotenv";
import { isAbsolute, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

if (!process.env.ARCHMAX_DATA_DIR) {
  process.env.ARCHMAX_DATA_DIR = resolve(root, "data");
} else if (!isAbsolute(process.env.ARCHMAX_DATA_DIR)) {
  process.env.ARCHMAX_DATA_DIR = resolve(root, process.env.ARCHMAX_DATA_DIR);
}
