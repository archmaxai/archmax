import type { Migration } from "./types";
import encryptConnectionCredentials from "./scripts/001-encrypt-connection-credentials";
import encryptTestAgentApiKeys from "./scripts/002-encrypt-test-agent-api-keys";

const migrations: Migration[] = [
  encryptConnectionCredentials,
  encryptTestAgentApiKeys,
];

export function getMigrations(): Migration[] {
  return [...migrations].sort((a, b) => {
    if (a.model !== b.model) return a.model.localeCompare(b.model);
    return a.version - b.version;
  });
}
