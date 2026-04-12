import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";

export interface IMcpCallLog {
  project: Types.ObjectId;
  tokenId: Types.ObjectId | null;
  tokenName: string;
  method: string;
  toolName: string | null;
  inputArgs: Record<string, unknown> | null;
  outputContent: string | null;
  durationMs: number;
  isError: boolean;
  errorMessage: string | null;
  clientIp: string;
  _schemaVersion: number;
  createdAt: Date;
}

export interface IMcpCallLogDocument extends IMcpCallLog, Document {}

const McpCallLogSchema = new Schema<IMcpCallLogDocument>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    tokenId: { type: Schema.Types.ObjectId, ref: "McpToken", default: null },
    tokenName: { type: String, required: true },
    method: { type: String, required: true },
    toolName: { type: String, default: null },
    inputArgs: { type: Schema.Types.Mixed, default: null },
    outputContent: { type: String, default: null },
    durationMs: { type: Number, required: true },
    isError: { type: Boolean, default: false },
    errorMessage: { type: String, default: null },
    clientIp: { type: String, required: true },
    _schemaVersion: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

McpCallLogSchema.index({ project: 1, createdAt: -1 });
McpCallLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const McpCallLog: Model<IMcpCallLogDocument> =
  mongoose.models.McpCallLog || mongoose.model<IMcpCallLogDocument>("McpCallLog", McpCallLogSchema);
