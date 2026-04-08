import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";
import { softDeletePlugin, type SoftDeleteFields, type SoftDeleteMethods } from "../infra/soft-delete-plugin";

export interface IToolCallRecord {
  id: string;
  name: string;
  args: string;
  result?: string;
  status?: "completed" | "error";
}

export type IContentSegment =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCall: IToolCallRecord };

export interface IMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: IToolCallRecord[];
  segments?: IContentSegment[];
  toolCallId?: string;
  timestamp: Date;
}

export interface IConversation {
  project: Types.ObjectId;
  testAgent?: Types.ObjectId;
  title: string;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationDocument extends IConversation, SoftDeleteFields, SoftDeleteMethods, Document {}

const MessageSchema = new Schema<IMessage>(
  {
    role: { type: String, required: true, enum: ["user", "assistant", "tool"] },
    content: { type: String, default: "" },
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
    segments: [{ type: Schema.Types.Mixed, _id: false }],
    toolCallId: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ConversationSchema = new Schema<IConversationDocument>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    testAgent: { type: Schema.Types.ObjectId, ref: "TestAgent", default: null },
    title: { type: String, default: "New conversation" },
    messages: { type: [MessageSchema], default: [] },
  },
  { timestamps: true },
);

ConversationSchema.plugin(softDeletePlugin);
ConversationSchema.index({ project: 1, createdAt: -1 });

export const Conversation: Model<IConversationDocument> =
  mongoose.models.Conversation || mongoose.model<IConversationDocument>("Conversation", ConversationSchema);
