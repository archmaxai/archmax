import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";

export interface IRelationship {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  description: string;
}

export interface IMetric {
  name: string;
  expression: string;
  description: string;
  format?: string;
}

export interface ISemanticModel {
  name: string;
  dataSource: Types.ObjectId;
  description: string;
  relationships: IRelationship[];
  metrics: IMetric[];
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISemanticModelDocument extends ISemanticModel, Document {}

const RelationshipSchema = new Schema<IRelationship>(
  {
    name: { type: String, required: true },
    fromTable: { type: String, required: true },
    fromColumn: { type: String, required: true },
    toTable: { type: String, required: true },
    toColumn: { type: String, required: true },
    type: { type: String, required: true, enum: ["one-to-one", "one-to-many", "many-to-many"] },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const MetricSchema = new Schema<IMetric>(
  {
    name: { type: String, required: true },
    expression: { type: String, required: true },
    description: { type: String, default: "" },
    format: { type: String },
  },
  { _id: false },
);

const SemanticModelSchema = new Schema<ISemanticModelDocument>(
  {
    name: { type: String, required: true },
    dataSource: { type: Schema.Types.ObjectId, ref: "DataSource", required: true },
    description: { type: String, default: "" },
    relationships: [RelationshipSchema],
    metrics: [MetricSchema],
    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SemanticModelSchema.index({ name: 1 }, { unique: true });
SemanticModelSchema.index({ dataSource: 1 });
SemanticModelSchema.index({ tags: 1 });

export const SemanticModel: Model<ISemanticModelDocument> =
  mongoose.models.SemanticModel || mongoose.model<ISemanticModelDocument>("SemanticModel", SemanticModelSchema);
