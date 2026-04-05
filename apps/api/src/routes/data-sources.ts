import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@semlayer/core/infra/db";
import { DataSource, type IDataSource } from "@semlayer/core/models/index";
import { AppError } from "../utils/errors";

const columnSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional().default(""),
  isPrimaryKey: z.boolean().optional().default(false),
  isForeignKey: z.boolean().optional().default(false),
  references: z.object({
    table: z.string(),
    column: z.string(),
  }).optional(),
});

const tableSchema = z.object({
  name: z.string(),
  schema: z.string().optional(),
  description: z.string().optional().default(""),
  columns: z.array(columnSchema).optional().default([]),
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["postgres", "mysql", "mssql", "mongodb"]),
  description: z.string().optional().default(""),
  connectionString: z.string().min(1),
  tables: z.array(tableSchema).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

type DataSourceResponse = IDataSource & { _id: string };

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const dataSources = await DataSource.find().sort({ createdAt: -1 }).lean();
    return c.json(dataSources as unknown as DataSourceResponse[]);
  })
  .get("/:id", async (c) => {
    await connectDB();
    const ds = await DataSource.findById(c.req.param("id")).lean();
    if (!ds) throw AppError.notFound("Data source not found");
    return c.json(ds as unknown as DataSourceResponse);
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    await connectDB();
    const body = c.req.valid("json");
    const ds = await DataSource.create(body);
    return c.json(ds as unknown as DataSourceResponse, 201);
  })
  .put("/:id", zValidator("json", updateSchema), async (c) => {
    await connectDB();
    const body = c.req.valid("json");
    const ds = await DataSource.findByIdAndUpdate(
      c.req.param("id"),
      { $set: body },
      { new: true },
    );
    if (!ds) throw AppError.notFound("Data source not found");
    return c.json(ds as unknown as DataSourceResponse);
  })
  .delete("/:id", async (c) => {
    await connectDB();
    const ds = await DataSource.findByIdAndDelete(c.req.param("id"));
    if (!ds) throw AppError.notFound("Data source not found");
    return c.json({ ok: true });
  });

export default app;
