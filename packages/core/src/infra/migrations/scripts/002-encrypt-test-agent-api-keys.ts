import type { Model, Document, Types } from "mongoose";
import { encrypt } from "../../crypto";
import { getEnv } from "../../../config/env";
import type { Migration } from "../types";

interface TestAgentLeanDoc {
  _id: Types.ObjectId;
  encryptedApiKey?: string;
}

const HEX_CIPHERTEXT_RE = /^[0-9a-f]{56,}$/;

function looksEncrypted(value: string): boolean {
  return HEX_CIPHERTEXT_RE.test(value);
}

const OUTDATED_FILTER = { _schemaVersion: { $lt: 1 } };

const migration: Migration = {
  model: "TestAgent",
  version: 1,
  description: "Encrypt plaintext test agent API keys at rest",
  async up(TestAgentModel: Model<Document>): Promise<number> {
    const key = getEnv().ENCRYPTION_KEY || null;

    const docs = await TestAgentModel.find(OUTDATED_FILTER).lean<TestAgentLeanDoc[]>();

    if (docs.length === 0) return 0;

    if (!key) {
      console.warn("  ENCRYPTION_KEY not set, skipping API key encryption");
      await TestAgentModel.updateMany(OUTDATED_FILTER, { $set: { _schemaVersion: 1 } });
      return docs.length;
    }

    let migrated = 0;
    for (const doc of docs) {
      const updates: Record<string, unknown> = { _schemaVersion: 1 };

      if (typeof doc.encryptedApiKey === "string" && doc.encryptedApiKey && !looksEncrypted(doc.encryptedApiKey)) {
        updates.encryptedApiKey = encrypt(doc.encryptedApiKey, key);
      }

      await TestAgentModel.updateOne({ _id: doc._id }, { $set: updates });
      migrated++;
    }

    return migrated;
  },
};

export default migration;
