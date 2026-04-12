import type { Model, Document, Types } from "mongoose";
import { encrypt } from "../../crypto";
import { getEnv } from "../../../config/env";
import type { Migration } from "../types";

interface ConnectionLeanDoc {
  _id: Types.ObjectId;
  connectionConfig?: Record<string, unknown>;
}

const HEX_CIPHERTEXT_RE = /^[0-9a-f]{56,}$/;

function looksEncrypted(value: string): boolean {
  return HEX_CIPHERTEXT_RE.test(value);
}

const OUTDATED_FILTER = { _schemaVersion: { $lt: 1 } };

const migration: Migration = {
  model: "Connection",
  version: 1,
  description: "Encrypt plaintext connection credentials at rest",
  async up(ConnectionModel: Model<Document>): Promise<number> {
    const key = getEnv().ENCRYPTION_KEY || null;

    const docs = await ConnectionModel.find(OUTDATED_FILTER).lean<ConnectionLeanDoc[]>();

    if (docs.length === 0) return 0;

    if (!key) {
      console.warn("  ENCRYPTION_KEY not set, skipping credential encryption");
      await ConnectionModel.updateMany(OUTDATED_FILTER, { $set: { _schemaVersion: 1 } });
      return docs.length;
    }

    let migrated = 0;
    for (const doc of docs) {
      const config = doc.connectionConfig ?? {};
      const updates: Record<string, unknown> = { _schemaVersion: 1 };
      let needsConfigUpdate = false;

      if (typeof config.password === "string" && config.password && !looksEncrypted(config.password)) {
        config.password = encrypt(config.password, key);
        needsConfigUpdate = true;
      }

      if (typeof config.uri === "string" && config.uri && !looksEncrypted(config.uri)) {
        config.uri = encrypt(config.uri, key);
        needsConfigUpdate = true;
      }

      if (needsConfigUpdate) {
        updates.connectionConfig = config;
      }

      await ConnectionModel.updateOne({ _id: doc._id }, { $set: updates });
      migrated++;
    }

    return migrated;
  },
};

export default migration;
