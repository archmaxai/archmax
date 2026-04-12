import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "../infra/soft-delete-plugin";

export interface ITestAgent {
  name: string;
  project: Types.ObjectId;
  semanticModels: string[];
  systemPrompt: string;
  llmBaseUrl: string;
  encryptedApiKey: string;
  llmModel: string;
  _schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITestAgentDocument extends ITestAgent, SoftDeleteFields, SoftDeleteMethods, Document {}

const TestAgentSchema = new Schema<ITestAgentDocument>(
  {
    name: { type: String, required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    semanticModels: { type: [String], default: [] },
    systemPrompt: { type: String, required: true },
    llmBaseUrl: { type: String, required: true },
    encryptedApiKey: { type: String, required: true },
    llmModel: { type: String, required: true },
    _schemaVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

TestAgentSchema.plugin(softDeletePlugin);
TestAgentSchema.index({ project: 1 });

export const TestAgent: Model<ITestAgentDocument> =
  mongoose.models.TestAgent || mongoose.model<ITestAgentDocument>("TestAgent", TestAgentSchema);
