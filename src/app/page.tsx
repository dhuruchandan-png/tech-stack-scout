import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { Fingerprint } from "@/components/viz/Fingerprint";
import { HealthStrip } from "@/components/ui/HealthStrip";
import { DiffView } from "@/components/ui/DiffView";
import { ConfidenceMeter } from "@/components/ui/Pills";
import { EmptyState, SetupNotice } from "@/components/ui/States";
import { RadarSweep } from "@/components/viz/RadarSweep";
import { callTheseFirst, getAccounts, getSettings, getSystemHealth } from "@/lib/queries";
import { nextWeeklyRefresh, safe } from "@/lib/safe";
import { freshnessOf } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const res = await safe(async () => {
    const accts = await getAccounts();
    const health = await getSystemHealth(accts);
    const settings = await getSettings();
    return { accts, health, notesEmpty: !(settings.productNotes ?? "").trim() };
  });
  if (!res.ok) return <SetupNotice error={res.error} />;
  const { accts, health, notesEmpty } = res.data;

  const now = new Date();
  const next = nextWeeklyRefresh(now);
  const hour = Number(now.toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const top = callTheseFirst(accts, 5);

  const feed = accts
    .flatMap((a) => (a.snapshot?.changes ?? []).filter((c) => !/first snapshot|no material/i.test(c.text)).map((c) => ({ a, c })))
    .sort((x, y) => (y.a.snapshot!.createdAt.getTime() - x.a.snapshot!.createdAt.getTime()) || (x.c.sign === "+" ? -1 : 1))
    .slice(0, 14);

  const dist = { fresh: 0, aging: 0, stale: 0, never: 0 };
  for (const a of accts) {
    if (!a.snapshot) dist.never++;
    else dist[freshnessOf(a.snapshot.createdAt).level]++;
  }
  const lowConf = accts.filter((a) => a.snapshot?.confidence === "low");
  const failedSources = accts.flatMap((a) => Object.entries(a.snapshot?.sourceStatus ?? {}).filter(([, s]) => s.state === "failed").map(([src, s]) => ({ a, src, s })));
  const needsReview = accts.filter((a) => a.brief?.checkStatus === "needs_review");

  return (
    <div>
      <HealthStrip h={health} />

      {notesEmpty && (
        <div className="mt-4 flex items-start gap-3 rounded-card border border-change/40 bg-change/10 px-4 py-3 text-[13px] text-change" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Product notes are empty.</b> Gemini does not know what Nikhil sells, so first lines will be generic.{" "}
            <Link href="/settings" className="underline">Add them in Settings</Link>.
          </span>
        </div>
      )}

      <section className="topo-wrap relative">
        <div className="topo absolute inset-x-0 top-0 h-[300px]" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 pb-6 pt-8">
          <div>
            <div className="label mb-1">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</div>
            <h1 className="serif text-[38px] leading-tight">{greet}, Nikhil.</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              Next weekly refresh in <span className="mono text-signal">{next.days}d {next.hours}h</span> · Mondays 6:00 IST
            </p>
            <p className="mt-2 text-[12.5px] text-muted">
              New here? Scout checks each account&apos;s public engineering footprint every week and backs every claim with a source.{" "}
              <Link href="/how-it-works" className="text-signal hover:underline">See how it works →</Link>
            </p>
          </div>
          <RadarSweep />
        </div>
      </section>

      {accts.length === 0 ? (
        <div className="card">
          <EmptyState title="Your watchlist is empty." hint="Add a company to start scouting. Its stack, hiring and recent posts show up within a minute." action={<Link href="/accounts?add=1" className="btn btn-primary">Add a company</Link>} />
        </div>
      ) : (
        <>
          <section aria-labelledby="call-first">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="call-first" className="label">Call these first</h2>
              <Link href="/accounts" className="flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">All accounts <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {top.map(({ row, reason }, idx) => (
                <Link key={row.company.id} href={`/accounts/${row.company.domain}`} className="card group flex animate-rise flex-col gap-3 p-4 transition hover:border-signal/50" style={{ animationDelay: `${idx * 40}ms` }}>
                  <div className="flex items-center gap-3">
                    <Fingerprint size={44} languages={(row.snapshot?.languages ?? []).slice(0, 5)} categories={Object.keys(row.snapshot?.infra?.categories ?? {})} level={row.snapshot?.activity?.level ?? "dormant"} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{row.company.name}</div>
                      <div className="mono truncate text-[11px] text-faint">{row.company.domain}</div>
                    </div>
                  </div>
                  <div className="text-[12.5px] text-signal">{reason}</div>
                  <p className="serif line-clamp-4 flex-1 text-[15px] leading-snug text-ink/90">
                    {row.brief?.openerText ? `“${row.brief.openerText}”` : <span className="text-muted">Opener pending</span>}
                  </p>
                  <span className="flex items-center gap-1 text-[12.5px] text-muted group-hover:text-signal">Open brief <ArrowRight className="h-3 w-3" /></span>
                </Link>
              ))}
            </div>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="card p-5" aria-labelledby="changed">
              <h2 id="changed" className="label mb-3">What changed since the last refresh</h2>
              {feed.length === 0 ? (
                <p className="text-[13px] text-muted">Nothing notable yet. Changes show up after the next refresh.</p>
              ) : (
                <DiffView
                  changes={feed.map((f) => f.c)}
                  evidence={{}}
                  prefix={(c) => {
                    const f = feed.find((x) => x.c === c);
                    return f ? <Link href={`/accounts/${f.a.company.domain}`} className="mr-2 font-semibold text-ink underline decoration-dotted underline-offset-4">{f.a.company.name}</Link> : null;
                  }}
                />
              )}
            </section>

            <section className="card p-5" aria-labelledby="health">
              <h2 id="health" className="label mb-4">Watchlist health</h2>
              <div className="mb-5">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`Freshness: ${dist.fresh} fresh, ${dist.aging} aging, ${dist.stale} stale, ${dist.never} never refreshed`}>
                  <div className="bg-signal" style={{ flex: dist.fresh }} />
                  <div className="bg-change" style={{ flex: dist.aging }} />
                  <div className="bg-alert" style={{ flex: dist.stale + dist.never }} />
                </div>
                <div className="mono mt-2 flex gap-4 text-[11.5px] text-muted">
                  <span><span className="text-signal">●</span> {dist.fresh} fresh</span>
                  <span><span className="text-change">●</span> {dist.aging} aging</span>
                  <span><span className="text-alert">●</span> {dist.stale + dist.never} stale/never</span>
                </div>
              </div>

              <div className="space-y-4 text-[13px]">
                <div>
                  <div className="label mb-1.5">Low-confidence accounts</div>
                  {lowConf.length === 0 ? <span className="text-muted">None. Every account has solid coverage.</span> : (
                    <ul className="space-y-1.5">
                      {lowConf.map((a) => (
                        <li key={a.company.id} className="flex items-center justify-between gap-2">
                          <Link href={`/accounts/${a.company.domain}`} className="truncate hover:text-signal">{a.company.name}</Link>
                          <ConfidenceMeter level="low" reason={a.snapshot?.confidenceReason} inline />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="label mb-1.5">Failed sources</div>
                  {failedSources.length === 0 ? <span className="text-muted">All sources healthy.</span> : (
                    <ul className="space-y-1.5">
                      {failedSources.slice(0, 6).map(({ a, src, s }) => (
                        <li key={`${a.company.id}-${src}`} className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-change" />
                          <span className="truncate"><b>{a.company.name}</b> · {src}</span>
                          <Link href={`/accounts/${a.company.domain}?tab=sources`} className="ml-auto text-[12px] text-signal hover:underline">fix</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {needsReview.length > 0 && (
                  <div>
                    <div className="label mb-1.5">First lines needing review</div>
                    <ul className="space-y-1.5">
                      {needsReview.map((a) => (
                        <li key={a.company.id}><Link href={`/accounts/${a.company.domain}`} className="text-change hover:underline">{a.company.name}</Link></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
