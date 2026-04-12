import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";

export interface IFactResult {
  fact: string;
  passed: boolean;
  reasoning: string;
}

export interface ITestCaseResult {
  testCase: Types.ObjectId;
  title: string;
  semanticModel: string;
  inputMessage: string;
  expectedFacts: string[];
  maxToolCalls?: number;
  status: "pending" | "running" | "passed" | "failed" | "error";
  agentResponse: string;
  toolCalls: { id: string; name: string; args: string; result?: string; status?: "completed" | "error" }[];
  factResults: IFactResult[];
  durationMs: number;
  errorMessage?: string;
}

export interface ITestRun {
  project: Types.ObjectId;
  testAgent: Types.ObjectId;
  status: "pending" | "running" | "completed" | "failed";
  cases: ITestCaseResult[];
  startedAt: Date | null;
  completedAt: Date | null;
  _schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITestRunDocument extends ITestRun, Document {}

const FactResultSchema = new Schema<IFactResult>(
  {
    fact: { type: String, required: true },
    passed: { type: Boolean, required: true },
    reasoning: { type: String, default: "" },
  },
  { _id: false },
);

const TestCaseResultSchema = new Schema<ITestCaseResult>(
  {
    testCase: { type: Schema.Types.ObjectId, ref: "TestCase", required: true },
    title: { type: String, required: true },
    semanticModel: { type: String, required: true },
    inputMessage: { type: String, required: true },
    expectedFacts: { type: [String], default: [] },
    maxToolCalls: { type: Number },
    status: { type: String, required: true, enum: ["pending", "running", "passed", "failed", "error"], default: "pending" },
    agentResponse: { type: String, default: "" },
    toolCalls: [
      {
        id: { type: String },
        name: { type: String },
        args: { type: String },
        result: { type: String },
        status: { type: String, enum: ["completed", "error"] },
        _id: false,
      },
    ],
    factResults: { type: [FactResultSchema], default: [] },
    durationMs: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { _id: false },
);

const TestRunSchema = new Schema<ITestRunDocument>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    testAgent: { type: Schema.Types.ObjectId, ref: "TestAgent", required: true },
    status: { type: String, required: true, enum: ["pending", "running", "completed", "failed"], default: "pending" },
    cases: { type: [TestCaseResultSchema], default: [] },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    _schemaVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

TestRunSchema.index({ project: 1, createdAt: -1 });

export const TestRun: Model<ITestRunDocument> =
  mongoose.models.TestRun || mongoose.model<ITestRunDocument>("TestRun", TestRunSchema);
