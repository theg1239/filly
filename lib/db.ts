import { neon } from "@neondatabase/serverless";
import { drizzle } from "./drizzle";
import * as schema from "./schema";

let sql: ReturnType<typeof neon> | null = null;

export const getDb = () => {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }

  return drizzle(sql, { schema });
};

export type DbType = ReturnType<typeof getDb>;
