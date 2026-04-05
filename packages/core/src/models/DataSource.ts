import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface IColumnDescription {
  name: string;
  type: string;
  description: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface ITableDescription {
  name: string;
  schema?: string;
  description: string;
  columns: IColumnDescription[];
}

export type DataSourceType = "postgres" | "mysql" | "mssql" | "mongodb";

export interface IDataSource {
  name: string;
  type: DataSourceType;
  description: string;
  connectionString: string;
  tables: ITableDescription[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDataSourceDocument extends IDataSource, Document {}

const ColumnDescriptionSchema = new Schema<IColumnDescription>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    description: { type: String, default: "" },
    isPrimaryKey: { type: Boolean, default: false },
    isForeignKey: { type: Boolean, default: false },
    references: {
      type: {
        table: { type: String, required: true },
        column: { type: String, required: true },
      },
      required: false,
    },
  },
  { _id: false },
);

const TableDescriptionSchema = new Schema<ITableDescription>(
  {
    name: { type: String, required: true },
    schema: { type: String },
    description: { type: String, default: "" },
    columns: [ColumnDescriptionSchema],
  },
  { _id: false },
);

const DataSourceSchema = new Schema<IDataSourceDocument>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ["postgres", "mysql", "mssql", "mongodb"] },
    description: { type: String, default: "" },
    connectionString: { type: String, required: true },
    tables: [TableDescriptionSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

DataSourceSchema.index({ name: 1 }, { unique: true });
DataSourceSchema.index({ type: 1 });

export const DataSource: Model<IDataSourceDocument> =
  mongoose.models.DataSource || mongoose.model<IDataSourceDocument>("DataSource", DataSourceSchema);
