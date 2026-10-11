import Link from "next/link";
import { and, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { RadarCharts } from "@/components/radar/RadarCharts";
import { TechRadar } from "@/components/radar/TechRadar";
import { EmptyState, PageHeader, SetupNotice } from "@/components/ui/States";
import { TECH_TERMS } from "@/lib/compute/techdict";
import { QUADRANT_LABEL, buildRadar } from "@/lib/compute/radar";
import { getAccounts } from "@/lib/queries";
import { safe } from "@/lib/safe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Radar" };

const DATA_TECH = new Set(TECH_TERMS.filter((t) => t.group === "data").map((t) => t.name));

export default async function RadarPage() {
  const res = await safe(async () => {
    const accts = (await getAccounts()).filter((a) => a.snapshot);
    const db = getDb();
    const snapIds = accts.map((a) => a.snapshot!.id);
    const evs = snapIds.length
      ? await db.select({ snapshotId: schema.evidence.snapshotId, meta: schema.evidence.meta }).from(schema.evidence).where(and(inArray(schema.evidence.snapshotId, snapIds), inArray(schema.evidence.source, ["jobs", "blog"])))
      : [];
    const allSnaps = snapIds.length
      ? await db.select({ weekOf: schema.snapshots.weekOf, companyId: schema.snapshots.companyId, activity: schema.snapshots.activity }).from(schema.snapshots).where(inArray(schema.snapshots.companyId, accts.map((a) => a.company.id)))
      : [];
    return { accts, evs, allSnaps };
  });
  if (!res.ok) return <SetupNotice error={res.error} />;
  const { accts, evs, allSnaps } = res.data;
  if (accts.length === 0) return <div><PageHeader title="Radar" /><div className="card"><EmptyState title="Nothing to plot yet." hint="Refresh a few accounts and the radar fills in." /></div></div>;

  const items = buildRadar(
    accts.map((a) => ({
      name: a.company.name, domain: a.company.domain,
      languages: (a.snapshot!.languages ?? []).map((l) => ({ name: l.name, share: l.share })),
      clouds: a.snapshot!.infra?.clouds ?? [],
      tools: [...new Map((a.snapshot!.infra?.items ?? []).map((i) => [i.tool, { name: i.tool, category: i.category }])).values()],
      dataTech: [...new Set(evs.filter((e) => e.snapshotId === a.snapshot!.id).flatMap((e) => ((e.meta as { techs?: string[] } | null)?.techs ?? []).filter((t) => DATA_TECH.has(t))))],
    })),
  );

  const n = accts.length;
  // average language share across the watchlist
  const langAvg = new Map<string, { sum: number; color: string; accounts: number }>();
  for (const a of accts) for (const l of a.snapshot!.languages ?? []) {
    const x = langAvg.get(l.name) ?? { sum: 0, color: l.color, accounts: 0 };
    x.sum += l.share; x.accounts++; langAvg.set(l.name, x);
  }
  const languages = [...langAvg.entries()].map(([name, v]) => ({ name, color: v.color, avg: v.sum / n, accounts: v.accounts })).sort((a, b) => b.avg - a.avg).slice(0, 8);

  const cloudCount = new Map<string, number>();
  for (const a of accts) for (const c of a.snapshot!.infra?.clouds ?? []) cloudCount.set(c, (cloudCount.get(c) ?? 0) + 1);
  const clouds = [...cloudCount.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // hiring momentum: sum of open eng roles per week (latest snapshot per company per week)
  const byWeek = new Map<string, Map<number, number>>();
  for (const s of allSnaps) {
    const m = byWeek.get(s.weekOf) ?? new Map<number, number>();
    m.set(s.companyId, s.activity?.openRoles ?? 0);
    byWeek.set(s.weekOf, m);
  }
  const hiring = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, m]) => ({ week, roles: [...m.values()].reduce((s, v) => s + v, 0) }));

  const tools = items.filter((i) => i.quadrant !== "languages").slice(0, 24);

  return (
    <div>
      <PageHeader eyebrow={`${n} accounts · prevalence across your watchlist`} title="Tech radar" />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <section className="card p-5"><TechRadar items={items} /></section>
        <RadarCharts languages={languages} clouds={clouds} hiring={hiring} />
      </div>

      <section className="card mt-6 overflow-x-auto">
        <div className="label border-b border-line px-4 py-3">Tools and the accounts that use them</div>
        <table className="w-full min-w-[640px] text-[13px]">
          <thead><tr className="label text-left"><th className="px-4 py-2.5 font-normal">Tool</th><th className="font-normal">Quadrant</th><th className="font-normal">Ring</th><th className="font-normal">Accounts</th><th /></tr></thead>
          <tbody>
            {tools.map((t) => (
              <tr key={`${t.quadrant}-${t.name}`} className="border-t border-line">
                <td className="px-4 py-2.5 font-medium">{t.name}</td>
                <td className="text-muted">{QUADRANT_LABEL[t.quadrant]}</td>
                <td className="capitalize text-muted">{t.ring}</td>
                <td className="mono">{t.count}<span className="ml-2 font-sans text-[12px] text-faint">{t.accounts.slice(0, 3).map((a) => a.name).join(", ")}{t.accounts.length > 3 && "…"}</span></td>
                <td className="pr-4 text-right">{t.filter && <Link className="text-signal hover:underline" href={`/accounts?${t.filter.key}=${encodeURIComponent(t.filter.value)}`}>Filter</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
