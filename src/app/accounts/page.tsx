import { SetupNotice } from "@/components/ui/States";
import { HealthStrip } from "@/components/ui/HealthStrip";
import { WatchlistTable, type Row } from "@/components/watchlist/WatchlistTable";
import { getAccounts, getSystemHealth } from "@/lib/queries";
import { safe } from "@/lib/safe";
import { DAY } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "Watchlist" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const res = await safe(async () => {
    const all = await getAccounts({ includeRemoved: true });
    const active = all.filter((a) => a.company.active);
    return { all, active, health: await getSystemHealth(active) };
  });
  if (!res.ok) return <SetupNotice error={res.error} />;
  const { all, active, health } = res.data;
  const weekAgo = Date.now() - 7 * DAY;

  const rows: Row[] = active.map((a) => {
    const s = a.snapshot;
    const failed = Object.entries(s?.sourceStatus ?? {}).find(([, v]) => v.state === "failed");
    return {
      id: a.company.id,
      name: a.company.name,
      domain: a.company.domain,
      languages: (s?.languages ?? []).slice(0, 5).map((l) => ({ name: l.name, color: l.color, share: l.share })),
      clouds: s?.infra?.clouds ?? [],
      tools: [...new Set((s?.infra?.items ?? []).map((i) => i.tool))],
      categories: Object.keys(s?.infra?.categories ?? {}),
      microservices: s?.microservices?.level ?? "unknown",
      activity: s?.activity?.level ?? "dormant",
      series: s?.commitSeries ?? [],
      confidence: s?.confidence ?? null,
      confidenceReason: s?.confidenceReason ?? null,
      snapshotAt: s?.createdAt.toISOString() ?? null,
      staleSource: failed ? { source: failed[0], since: failed[1].staleSince ?? s!.createdAt.toISOString() } : null,
      opener: a.brief?.checkStatus ?? (s ? "pending" : null),
      hubspot: a.hubspot,
      hubspotError: a.hubspotError,
      changed: !!s && s.createdAt.getTime() > weekAgo && (s.changes ?? []).some((c) => c.sign !== "~" || !/first snapshot|no material/i.test(c.text)),
    };
  });
  const removed = all
    .filter((a) => !a.company.active && a.company.removedAt && Date.now() - a.company.removedAt.getTime() < 30 * DAY)
    .map((a) => ({ id: a.company.id, name: a.company.name, domain: a.company.domain }));

  return (
    <div>
      <HealthStrip h={health} />
      <WatchlistTable
        rows={rows} removed={removed} openAdd={sp.add === "1"}
        initial={{ cloud: sp.cloud ?? "", lang: sp.lang ?? "", tool: sp.tool ?? "" }}
      />
    </div>
  );
}
