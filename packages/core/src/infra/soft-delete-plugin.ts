import type { Schema, Query, HydratedDocument } from "mongoose";

export interface SoftDeleteFields {
  deleted: boolean;
  deletedAt: Date | null;
}

export interface SoftDeleteMethods {
  softDelete(): Promise<this>;
  restore(): Promise<this>;
}

export type SoftDeleteDocument = HydratedDocument<SoftDeleteFields, SoftDeleteMethods>;

const FILTERED_OPERATIONS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "countDocuments",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
] as const;

export function softDeletePlugin(schema: Schema) {
  schema.add({
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  });

  for (const op of FILTERED_OPERATIONS) {
    schema.pre(op as any, function (this: Query<any, any>) {
      const filter = this.getFilter();
      if (filter.deleted === undefined && !(filter as any)._withDeleted) {
        this.where({ deleted: { $ne: true } });
      }
      if ((filter as any)._withDeleted) {
        delete (filter as any)._withDeleted;
      }
    });
  }

  schema.methods.softDelete = async function (this: SoftDeleteDocument) {
    this.deleted = true;
    this.deletedAt = new Date();
    return this.save();
  };

  schema.methods.restore = async function (this: SoftDeleteDocument) {
    this.deleted = false;
    this.deletedAt = null;
    return this.save();
  };
}
