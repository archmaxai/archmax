import crypto from "node:crypto";
import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "../infra/soft-delete-plugin";

export interface IMcpToken {
  name: string;
  tokenHash: string;
  project: Types.ObjectId;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  _schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMcpTokenDocument extends IMcpToken, SoftDeleteFields, SoftDeleteMethods, Document {}

const McpTokenSchema = new Schema<IMcpTokenDocument>(
  {
    name: { type: String, required: true },
    tokenHash: { type: String, required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    scopes: { type: [String], default: [] },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    _schemaVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

McpTokenSchema.plugin(softDeletePlugin);
McpTokenSchema.index({ tokenHash: 1, project: 1 });
McpTokenSchema.index({ project: 1 });

export const McpToken: Model<IMcpTokenDocument> =
  mongoose.models.McpToken || mongoose.model<IMcpTokenDocument>("McpToken", McpTokenSchema);

const TOKEN_PREFIX = "sml_";

export function generateMcpToken(): { raw: string; hash: string } {
  const rawBytes = crypto.randomBytes(32).toString("hex");
  const raw = `${TOKEN_PREFIX}${rawBytes}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashMcpToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
