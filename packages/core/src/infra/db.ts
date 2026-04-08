import mongoose from "mongoose";
import { getEnv } from "../config/env";

function getMongoUri(): string {
  const uri = getEnv().MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Set it in .env (local dev) or omit it inside Docker to use the embedded MongoDB.",
    );
  }
  if (!uri.includes("retryWrites")) {
    const separator = uri.includes("?") ? "&" : "?";
    return `${uri}${separator}retryWrites=false`;
  }
  return uri;
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as unknown as {
  mongoose?: MongooseCache;
};

const cached: MongooseCache = globalForMongoose.mongoose ?? {
  conn: null,
  promise: null,
};

if (!globalForMongoose.mongoose) {
  globalForMongoose.mongoose = cached;
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(getMongoUri(), {
      dbName: "archsem",
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
