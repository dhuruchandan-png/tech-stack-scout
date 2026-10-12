import { neon } from "@neondatabase/serverless";
import { DEFAULT_PRODUCT_NOTES } from "@/lib/settings-defaults";

/**
 * Tiny self-healing migrations plus raw access to columns added after the first release.
 * The Drizzle schema deliberately does not know about these, so an instance that has not migrated yet
 * can never break the queries that exist today. Every statement is idempotent.
 */
let migrated: Promise<void> | null = null;

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export function ensureSchema(): Promise<void> {
  if (!migrated) {
    migrated = (async () => {
      const q = sql();
      // per-company YouTube channel override (item: own-channel talks only)
      await q`ALTER TABLE companies ADD COLUMN IF NOT EXISTS youtube_channel_id text`;
      // Freshworks' public code lives in freshworks-developers, not the empty freshworks-org
      await q`UPDATE companies SET github_org = 'freshworks-developers', github_match_confidence = 'high'
              WHERE domain = 'freshworks.com' AND (github_org IS NULL OR github_org = 'freshworks-org')`;
      // default product notes, only when never set (editable in Settings)
      await q`UPDATE settings SET product_notes = ${DEFAULT_PRODUCT_NOTES} WHERE id = 1 AND product_notes IS NULL`;
    })().catch((e) => {
      migrated = null; // retry on the next call
      throw e;
    });
  }
  return migrated;
}

export async function getYoutubeChannelId(companyId: number): Promise<string | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT youtube_channel_id FROM companies WHERE id = ${companyId}`) as { youtube_channel_id: string | null }[];
  return rows[0]?.youtube_channel_id ?? null;
}

export async function setYoutubeChannelId(companyId: number, channelId: string | null): Promise<void> {
  await ensureSchema();
  await sql()`UPDATE companies SET youtube_channel_id = ${channelId} WHERE id = ${companyId}`;
}
