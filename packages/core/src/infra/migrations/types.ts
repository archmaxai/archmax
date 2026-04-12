import type { Model, Document } from "mongoose";

export interface Migration {
  model: string;
  version: number;
  description: string;
  up: (model: Model<Document>) => Promise<number>;
}
