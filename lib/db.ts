import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function db() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured.");
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return db().query<T>(text, values);
}
