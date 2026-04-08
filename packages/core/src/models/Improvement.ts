import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "../infra/soft-delete-plugin";

export interface IImprovement {
  project: Types.ObjectId;
  modelName: string;
  title: string;
  description: string;
  status: "pending" | "implemented";
  implementedAt: Date | null;
  createdVia: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IImprovementDocument extends IImprovement, SoftDeleteFields, SoftDeleteMethods, Document {}

const ImprovementSchema = new Schema<IImprovementDocument>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    modelName: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: ["pending", "implemented"], default: "pending" },
    implementedAt: { type: Date, default: null },
    createdVia: { type: String, required: true },
  },
  { timestamps: true },
);

ImprovementSchema.plugin(softDeletePlugin);
ImprovementSchema.index({ project: 1, createdAt: -1 });
ImprovementSchema.index({ project: 1, modelName: 1 });

export const Improvement: Model<IImprovementDocument> =
  mongoose.models.Improvement || mongoose.model<IImprovementDocument>("Improvement", ImprovementSchema);
