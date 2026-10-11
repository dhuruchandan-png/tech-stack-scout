import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

type Db = ReturnType<typeof client>;
let _db: Db | null = null;

/** Lazy so `next build` does not need a database. */
export function getDb(): Db {
  if (!_db) _db = client();
  return _db;
}

export { schema };
