import { hc } from "hono/client";
import type { AppType } from "@archsem/api";

const baseUrl = import.meta.env.VITE_API_URL ?? "";

export const api = hc<AppType>(baseUrl);
