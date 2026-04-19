import mongoose, { type Document, type Model, Schema } from "mongoose";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "../infra/soft-delete-plugin";

export const PROJECT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function slugifyProjectTitle(title: string): string {
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 2) slug = slug.padEnd(2, "0");
  return slug || "project";
}

export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugifyProjectTitle(title);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const query: Record<string, unknown> = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Project.findOne(query).select("_id").lean();
    if (!exists) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export interface IGitHubConfig {
  url: string;
  branch: string;
  encryptedToken: string;
}

export interface IProject {
  title: string;
  slug: string;
  description: string;
  mcpPageSize: number;
  github?: IGitHubConfig;
  _schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProjectDocument extends IProject, SoftDeleteFields, SoftDeleteMethods, Document {}

const GitHubConfigSchema = new Schema(
  {
    url: { type: String, required: true },
    branch: { type: String, default: "main" },
    encryptedToken: { type: String, required: true },
  },
  { _id: false },
);

const ProjectSchema = new Schema<IProjectDocument>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, match: PROJECT_SLUG_PATTERN },
    description: { type: String, default: "" },
    mcpPageSize: { type: Number, default: 50, min: 10, max: 200 },
    github: { type: GitHubConfigSchema, default: undefined },
    _schemaVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ProjectSchema.plugin(softDeletePlugin);
ProjectSchema.index({ title: 1, deleted: 1 }, { unique: true });
ProjectSchema.index({ slug: 1, deleted: 1 }, { unique: true });

export const Project: Model<IProjectDocument> =
  mongoose.models.Project || mongoose.model<IProjectDocument>("Project", ProjectSchema);
