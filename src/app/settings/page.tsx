import { SettingsForm } from "@/components/settings/SettingsForm";
import { PageHeader, SetupNotice } from "@/components/ui/States";
import { isAdmin } from "@/lib/auth";
import { hubspotConfigured } from "@/lib/hubspot";
import { getSettings } from "@/lib/queries";
import { safe } from "@/lib/safe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

async function githubRate(): Promise<{ remaining: number; limit: number; reset: string } | null> {
  if (!process.env.GITHUB_TOKEN) return null;
  try {
    const r = await fetch("https://api.github.com/rate_limit", { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "User-Agent": "tech-stack-scout" }, cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { resources: { core: { remaining: number; limit: number; reset: number } } };
    return { remaining: j.resources.core.remaining, limit: j.resources.core.limit, reset: new Date(j.resources.core.reset * 1000).toISOString() };
  } catch { return null; }
}

export default async function SettingsPage() {
  const res = await safe(getSettings);
  if (!res.ok) return <SetupNotice error={res.error} />;
  const s = res.data;
  const admin = await isAdmin();
  const rate = await githubRate();
  const env = (k: string) => !!process.env[k];

  return (
    <div>
      <PageHeader eyebrow="Product notes, internal recipients, connections" title="Settings" />
      <SettingsForm
        admin={admin} productNotes={s.productNotes ?? ""} allowlist={s.internalAllowlist ?? []} recipients={s.briefRecipients ?? []}
        hubspot={hubspotConfigured()} testMode={process.env.EMAIL_TEST_MODE === "true"} internalDomain={process.env.INTERNAL_EMAIL_DOMAIN ?? ""} testEmail={process.env.TEST_EMAIL ?? ""}
        sources={[
          { name: "GitHub", ok: env("GITHUB_TOKEN"), detail: rate ? `${rate.remaining}/${rate.limit} requests left · resets ${new Date(rate.reset).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "token missing or unreachable" },
          { name: "YouTube Data API", ok: env("YOUTUBE_API_KEY"), detail: "~100 quota units per company search · free tier is 10,000/day" },
          { name: "Gemini", ok: env("GEMINI_API_KEY"), detail: `model ${process.env.GEMINI_MODEL ?? "gemini-flash-latest"} (falls back across Flash versions)` },
          { name: "HubSpot", ok: hubspotConfigured(), detail: "private app token" },
          { name: "Resend", ok: env("RESEND_API_KEY"), detail: "internal drafts and Monday brief only" },
        ]}
        crons={[
          { path: "/api/cron/weekly-refresh", when: "Mondays 6:00 IST", cron: "30 0 * * 1" },
          { path: "/api/cron/monday-brief", when: "Mondays 8:00 IST", cron: "30 2 * * 1" },
        ]}
      />
    </div>
  );
}
