import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

/**
 * Applies drizzle/0000_init.sql then drizzle/seed.sql. Equivalent to pasting both into the Neon SQL editor.
 * Statements are split on ";\n" at top level, which is safe for these two files (no function bodies).
 */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const sql = neon(process.env.DATABASE_URL);
  for (const file of ["drizzle/0000_init.sql", "drizzle/seed.sql"]) {
    const text = readFileSync(file, "utf8").replace(/^--.*$/gm, "");
    const stmts = text.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const s of stmts) {
      const run = (sql as unknown as { query?: (q: string) => Promise<unknown> }).query;
      await (run ? run.call(sql, s) : (sql as unknown as (q: string) => Promise<unknown>)(s));
    }
    console.log(`applied ${file} (${stmts.length} statements)`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
