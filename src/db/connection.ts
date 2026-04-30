import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import * as schema from "./schema";

const sqlite: DB = new Database(process.env.DB_PATH ?? "tasks.db");

export const db = drizzle(sqlite, { schema });

export { sqlite };
