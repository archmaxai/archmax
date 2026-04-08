import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "../infra/soft-delete-plugin";

export interface ITestCase {
  title: string;
  project: Types.ObjectId;
  semanticModel: string;
  inputMessage: string;
  expectedFacts: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ITestCaseDocument extends ITestCase, SoftDeleteFields, SoftDeleteMethods, Document {}

const TestCaseSchema = new Schema<ITestCaseDocument>(
  {
    title: { type: String, required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    semanticModel: { type: String, required: true },
    inputMessage: { type: String, required: true },
    expectedFacts: { type: [String], required: true, validate: [(v: string[]) => v.length >= 1, "At least one expected fact is required"] },
  },
  { timestamps: true },
);

TestCaseSchema.plugin(softDeletePlugin);
TestCaseSchema.index({ project: 1 });

export const TestCase: Model<ITestCaseDocument> =
  mongoose.models.TestCase || mongoose.model<ITestCaseDocument>("TestCase", TestCaseSchema);
