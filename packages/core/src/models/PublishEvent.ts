import mongoose, { type Document, type Model, Schema, type Types } from "mongoose";

export interface IPublishEvent {
  project: Types.ObjectId;
  message: string;
  modelNames: string[];
  contentHash: string;
  _schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPublishEventDocument extends IPublishEvent, Document {}

const PublishEventSchema = new Schema<IPublishEventDocument>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    message: { type: String, required: true },
    modelNames: [{ type: String }],
    contentHash: { type: String, required: true },
    _schemaVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

PublishEventSchema.index({ project: 1, createdAt: -1 });

export const PublishEvent: Model<IPublishEventDocument> =
  mongoose.models.PublishEvent || mongoose.model<IPublishEventDocument>("PublishEvent", PublishEventSchema);
