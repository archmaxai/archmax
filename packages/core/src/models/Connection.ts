import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "../infra/soft-delete-plugin";

export const CONNECTION_TYPES = [
  "postgres",
  "mysql",
  "mssql",
  "sqlite",
  "duckdb",
  "motherduck",
] as const;

export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export interface IConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  user?: string;
  password?: string;
  uri?: string;
  [key: string]: unknown;
}

export const SLUG_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function slugifyConnectionName(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(slug)) slug = `_${slug}`;
  return slug || "_conn";
}

export interface IConnection {
  project: Types.ObjectId;
  name: string;
  slug: string;
  type: ConnectionType;
  connectionConfig: IConnectionConfig;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConnectionDocument extends IConnection, SoftDeleteFields, SoftDeleteMethods, Document {}

const ConnectionConfigSchema = new Schema<IConnectionConfig>(
  {
    host: { type: String },
    port: { type: Number },
    database: { type: String },
    schema: { type: String },
    user: { type: String },
    password: { type: String },
    uri: { type: String },
  },
  { _id: false, strict: false },
);

const ConnectionSchema = new Schema<IConnectionDocument>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, match: SLUG_PATTERN },
    type: { type: String, required: true, enum: CONNECTION_TYPES },
    connectionConfig: { type: ConnectionConfigSchema, required: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ConnectionSchema.plugin(softDeletePlugin);
ConnectionSchema.index({ project: 1, name: 1, deleted: 1 }, { unique: true });
ConnectionSchema.index({ project: 1, slug: 1, deleted: 1 }, { unique: true });
ConnectionSchema.index({ project: 1 });
ConnectionSchema.index({ type: 1 });

export const Connection: Model<IConnectionDocument> =
  mongoose.models.Connection || mongoose.model<IConnectionDocument>("Connection", ConnectionSchema);
