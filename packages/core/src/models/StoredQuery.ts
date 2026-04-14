import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";

export interface IStoredQuery {
  project: Types.ObjectId;
  tokenId: Types.ObjectId | null;
  modelName: string;
  sql: string;
  params: string[];
  createdAt: Date;
}

export interface IStoredQueryDocument extends IStoredQuery, Document {}

const StoredQuerySchema = new Schema<IStoredQueryDocument>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    tokenId: { type: Schema.Types.ObjectId, ref: "McpToken", default: null },
    modelName: { type: String, required: true },
    sql: { type: String, required: true },
    params: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

StoredQuerySchema.index({ project: 1, createdAt: -1 });

export const StoredQuery: Model<IStoredQueryDocument> =
  mongoose.models.StoredQuery || mongoose.model<IStoredQueryDocument>("StoredQuery", StoredQuerySchema);
