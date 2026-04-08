import { Schema } from "mongoose";

export type IAIContext =
  | string
  | {
      instructions?: string;
      synonyms?: string[];
      examples?: string[];
    };

type IAIContextObject = Exclude<IAIContext, string>;

export const AIContextSchema = new Schema<IAIContextObject>(
  {
    instructions: { type: String },
    synonyms: [{ type: String }],
    examples: [{ type: String }],
  },
  { _id: false },
);
