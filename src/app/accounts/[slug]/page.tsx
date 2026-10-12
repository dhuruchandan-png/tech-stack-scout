import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AccountActions } from "@/components/account/AccountActions";
import { AskTab } from "@/components/account/AskTab";
import { EvidenceTab } from "@/components/account/EvidenceTab";
import { HistoryTab } from "@/components/account/HistoryTab";
import { OpenerCard } from "@/components/account/OpenerCard";
import { SourcesTab } from "@/components/account/SourcesTab";
import { RecentTracker } from "@/components/account/RecentTracker";
import { DiffView, goodWeekLine } from "@/components/ui/DiffView";
import { ActivityBadge, ConfidenceMeter, FreshnessPill, HubspotBadge, MicroservicesBadge } from "@/components/ui/Pills";
import { CitedText, ReceiptRow, pickEvidence } from "@/components/ui/Receipts";
import { EmptyState, RadarIllustration, SetupNotice } from "@/components/ui/States";
import { CloudGlyph } from "@/components/viz/CloudGlyph";
import { Fingerprint } from "@/components/viz/Fingerprint";
import { HeatStrip } from "@/components/viz/HeatStrip";
import { LanguageBar } from "@/components/viz/LanguageBar";
import { dominantLanguages, pct } from "@/lib/compute/languages";
import { hubspotCompanyUrl } from "@/lib/hubspot";
import { getYoutubeChannelId } from "@/db/raw";
import { getAccountByDomain, getEvidence, getHistory, getQa, getRunsForCompany } from "@/lib/queries";
import { safe } from "@/lib/safe";
import { cn, fmtInt, timeAgo } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: decodeURIComponent((await params).slug) };
}

const TABS = [
  { id: "evidence", label: "Evidence" }, { id: "sources", label: "Sources & matching" }, { id: "ask", label: "Ask" },
  { id: "history", label: "History" }, { id: "runs", label: "Run log" },
];
const CATS: { key: string[]; label: string }[] = [
  { key: ["containers"], label: "Containers" }, { key: ["orchestration"], label: "Orchestration" }, { key: ["iac"], label: "IaC" },
  { key: ["cicd"], label: "CI/CD" }, { key: ["rpc"], label: "RPC" }, { key: ["platform", "sdk"], label: "Serverless / platform" },
];

export default async function AccountPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const domain = decodeURIComponent((await params).slug).toLowerCase();
  const tab = (await searchParams).tab ?? "evidence";
  const res = await safe(() => getAccountByDomain(domain));
  if (!res.ok) return <SetupNotice error={res.error} />;
  const acct = res.data;
  if (!acct) notFound();

  const { company, snapshot: snap, brief } = acct;
  const ev = snap ? await getEvidence(snap.id) : [];
  const evidence = pickEvidence(ev.map((e) => ({ ref: e.ref, source: e.source, title: e.title, snippet: e.snippet, url: e.url, observedAt: e.observedAt })));
  const history = snap ? await getHistory(company.id, tab === "history" ? 26 : 12) : [];
  // "last week" = the most recent snapshot that is at least 6 days older than this one
  const prevSnap = snap ? history.find((h) => h.id !== snap.id && snap.createdAt.getTime() - h.createdAt.getTime() >= 6 * 86_400_000 - 3_600_000) ?? null : null;

  const langs = snap?.languages ?? [];
  const dom = dominantLanguages(langs);
  const trend: Record<string, number> = {};
  if (prevSnap?.languages) for (const l of langs) { const b = prevSnap.languages.find((x) => x.name === l.name); if (b) trend[l.name] = (l.share - b.share) * 100; }
  const infra = snap?.infra;
  const act = snap?.activity;
  const failedSrc = Object.entries(snap?.sourceStatus ?? {}).find(([, s]) => s.state === "failed");
  const stale = failedSrc ? { source: failedSrc[0], since: failedSrc[1].staleSince ?? snap!.createdAt.toISOString() } : null;
  const refsOf = (pred: (e: (typeof ev)[number]) => boolean, n = 3) => ev.filter(pred).slice(0, n).map((e) => e.ref);
  const level = act?.level ?? "dormant";
  const hasGh = !!company.githubOrg;
  const changes = (snap?.changes ?? []);
  const goodWeek = goodWeekLine(changes);
  const evCount = ev.length;
  const noCode = snap && langs.length === 0;
  const youtubeChannelId = await getYoutubeChannelId(company.id).catch(() => null);

  return (
    <div>
      <RecentTracker domain={company.domain} />

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden pb-6 pt-8">
        <div className="topo absolute inset-x-0 top-0 h-[300px]" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 md:flex-row md:flex-wrap md:items-center md:gap-8">
          <div className="h-[112px] w-[112px] shrink-0 md:h-[168px] md:w-[168px] [&>svg]:h-full [&>svg]:w-full">
            <Fingerprint size={168} languages={langs.slice(0, 6)} categories={Object.keys(infra?.categories ?? {})} level={level} />
          </div>
          <div className="min-w-0 w-full flex-1 md:w-auto md:flex-[1_1_20rem]">
            <div className="label mb-1">Account brief</div>
            <h1 className="serif break-words text-[clamp(32px,6vw,60px)] leading-[1.05]">{company.name}</h1>
            <p className="mono mt-3 break-words text-[13.5px] text-muted [overflow-wrap:anywhere]">
              {company.domain}
              {company.githubOrg && <> · <a className="hover:text-signal" href={`https://github.com/${company.githubOrg}`} target="_blank" rel="noreferrer">github.com/{company.githubOrg}</a></>}
              {company.jobBoardProvider && <> · <span className="capitalize">{company.jobBoardProvider}</span></>}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <FreshnessPill at={snap?.createdAt ?? null} staleSince={stale} />
              <ConfidenceMeter level={snap?.confidence} reason={snap?.confidenceReason} />
              <HubspotBadge status={acct.hubspot} error={acct.hubspotError} />
              {snap?.microservices && <span className="chip"><MicroservicesBadge level={snap.microservices.level} /></span>}
              {!company.active && <span className="chip border-alert/40 text-alert">Removed</span>}
            </div>
          </div>
          <AccountActions companyId={company.id} name={company.name} domain={company.domain} hubspotUrl={hubspotCompanyUrl(company.hubspotCompanyId)} hasOpener={!!brief?.openerText} hubspotFailed={acct.hubspot === "failed"} />
        </div>
      </section>

      {!snap ? (
        <div className="card"><EmptyState title="No data for this account yet." hint="Click Refresh now to pull live GitHub, job-board, blog, talk and Hacker News data. It takes about a minute." /></div>
      ) : (
        <>
          {/* ---------- Q1 / Q2 / Q3 ---------- */}
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card flex flex-col p-5" aria-labelledby="q1">
              <div className="flex items-center justify-between"><h2 id="q1" className="label">Q1 · Languages</h2><span className="mono text-[11.5px] text-muted">{act?.activeRepos ?? 0} active repos</span></div>
              {noCode ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
                  <RadarIllustration size={84} />
                  <div className="font-medium">No public code found</div>
                  <p className="max-w-[260px] text-[12.5px] text-muted">{hasGh ? "Only forks or archived repos are public, so they are excluded." : "No public GitHub org matched. Q2 and Q3 lean on jobs, blog and talks."}</p>
                </div>
              ) : (
                <>
                  <div className="mt-3 flex items-baseline gap-3">
                    <span className="serif text-[44px] leading-none" style={{ color: dom[0]?.color }}>{dom.map((d) => d.name).join(" + ")}</span>
                    <span className="text-[13px] text-muted">dominant · {pct(dom.reduce((s, d) => s + d.share, 0))}% of code</span>
                  </div>
                  <div className="mt-5"><LanguageBar languages={langs.length > 5 ? [...langs.slice(0, 5)] : langs} trend={trend} /></div>
                  <div className="mt-auto space-y-1 pt-4 text-[12px] text-muted">
                    <div>Code size in active, non-fork repos pushed in the last 12 months <ReceiptRow ids={refsOf((e) => e.kind === "languages", 1)} evidence={evidence} /></div>
                    {(act?.docsRepos ?? 0) > 0 && <div className="mono text-[11px] text-faint">{act!.docsRepos} docs/example repos excluded · markup and config formats are not counted as languages</div>}
                    {act?.sdkHeavy && <div className="rounded-input border border-change/40 bg-change/10 px-2 py-1 text-[11.5px] text-change">Mostly public SDKs: their internal stack may differ.</div>}
                  </div>
                </>
              )}
            </section>

            <section className="card p-5" aria-labelledby="q2">
              <div className="flex items-center justify-between"><h2 id="q2" className="label">Q2 · Cloud & infra</h2><ReceiptRow ids={refsOf((e) => e.kind === "infra", 3)} evidence={evidence} /></div>
              {(() => {
                const cs = infra?.cloudStrength ?? (infra?.clouds ?? []).map((c) => ({ cloud: c, group: "runs" as const, strength: "some" as const, signals: 1, origins: 1 }));
                const runs = cs.filter((c) => c.group === "runs");
                const integ = cs.filter((c) => c.group === "integrates");
                const chip = (c: (typeof cs)[number]) => (
                  <span key={`${c.group}-${c.cloud}`} title={`${c.signals} independent signal${c.signals === 1 ? "" : "s"} from ${c.origins} ${c.origins === 1 ? "origin" : "origins"}`}
                    className={cn("chip", c.strength === "strong" ? "border-signal/40 bg-signal/10 text-signal" : c.strength === "some" ? "border-line-strong" : "border-dashed text-muted")}>
                    <CloudGlyph name={c.cloud} /> {c.cloud} <span className="mono text-[10.5px] opacity-80">{c.strength}</span>
                  </span>
                );
                const tools = ["Terraform", "Helm", "gRPC / protobuf", "Kubernetes"].filter((t) => (infra?.items ?? []).some((i) => i.tool === t));
                return (
                  <div className="mt-3 space-y-2.5">
                    <div>
                      <div className="label mb-1 !text-[10px]">Runs on / deploys to</div>
                      <div className="flex flex-wrap gap-1.5">{runs.length ? runs.map(chip) : <span className="text-[12.5px] text-faint">no deployment signals found</span>}</div>
                    </div>
                    {integ.length > 0 && (
                      <div>
                        <div className="label mb-1 !text-[10px]">Integrates with / supports</div>
                        <div className="flex flex-wrap gap-1.5">{integ.map(chip)}</div>
                      </div>
                    )}
                    {tools.length > 0 && <div className="flex flex-wrap gap-1.5">{tools.map((t) => <span key={t} className="chip !py-0 text-[11.5px] text-muted">{t}</span>)}</div>}
                  </div>
                );
              })()}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {CATS.map((c) => {
                  const tools = [...new Set(c.key.flatMap((k) => infra?.categories?.[k] ?? []))];
                  return (
                    <div key={c.label} className={cn("rounded-input border p-2.5", tools.length ? "border-line-strong bg-raised" : "border-line bg-transparent")}>
                      <div className={cn("text-[12px] font-medium", !tools.length && "text-faint")}>{c.label}</div>
                      <div className={cn("mono mt-0.5 line-clamp-2 text-[11px]", tools.length ? "text-muted" : "text-faint")}>{tools.length ? tools.slice(0, 3).join(" · ") : "none found"}</div>
                    </div>
                  );
                })}
              </div>
              {(infra?.jobMentions?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <div className="label mb-1.5 !text-[10px]">Seen in open engineering roles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {infra!.jobMentions!.slice(0, 6).map((m) => <span key={m.name} className="chip !py-0 text-[11.5px]">{m.name} <span className="mono text-faint">×{m.count}</span></span>)}
                  </div>
                </div>
              )}
              {snap.microservices && (
                <div className="mt-4 text-[13px]">
                  <MicroservicesBadge level={snap.microservices.level} />
                  <span className="text-muted"> · {snap.microservices.reasons.join(" · ")}</span>
                </div>
              )}
            </section>

            <section className="card p-5" aria-labelledby="q3">
              <div className="flex items-center justify-between"><h2 id="q3" className="label">Q3 · Activity</h2><ActivityBadge level={level} /></div>
              <div className="mt-4"><HeatStrip series={snap.commitSeries ?? []} size={15} /></div>
              <div className="mono mt-1.5 text-[10.5px] text-faint">commits per week · last 13 weeks{act?.wowChangePct != null && ` · ${act.wowChangePct > 0 ? "+" : ""}${act.wowChangePct}% vs the 30 days before`}{act?.botShare ? ` · bots excluded` : ""}</div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  [act?.commits30, "commits · 30d"], [act?.reposPushed30, "repos pushed · 30d"], [act?.jobsFound === false ? "none" : act?.openRoles, act?.jobsFound === false ? "jobs: board not found" : act?.totalRoles ? `eng roles (of ${fmtInt(act.totalRoles)} total)` : "open eng roles"],
                  [act?.releases90, "releases · 90d"], [act?.blogPosts90, "blog posts · 90d"], [act?.talks12mo, "talks · 12mo"],
                ].map(([n, l]) => (
                  <div key={l as string} className="rounded-input bg-raised px-3 py-2.5">
                    <div className={cn("mono text-[20px] font-medium leading-tight", n === "none" && "text-faint")}>{n === "none" ? "n/a" : act?.commitsKnown === false && l === "commits · 30d" ? "n/a" : fmtInt((n as number) ?? 0)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{l}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ---------- context + changes ---------- */}
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <div className="space-y-6">
              <section className="card p-6" aria-labelledby="ctx">
                <div className="mb-4 flex items-center justify-between"><h2 id="ctx" className="label">Engineering context</h2><span className="mono text-[11.5px] text-faint">{evCount} evidence items</span></div>
                {brief?.summaryP1 ? (
                  <div className="serif max-w-[68ch] space-y-5 text-[19px] leading-[1.62]">
                    <p><CitedText text={brief.summaryP1} evidence={evidence} /></p>
                    <p><CitedText text={brief.summaryP2 ?? ""} evidence={evidence} /></p>
                  </div>
                ) : (
                  <p className="text-[14px] text-muted">{brief?.checkStatus === "pending" ? "The summary is waiting because Gemini was unavailable. The numbers above are current, and the summary will be written on the next refresh." : "No summary yet. Click Refresh now."}</p>
                )}
                {brief?.summaryP1 && (
                  <p className="mt-5 flex flex-wrap items-center gap-x-2 text-[12px] text-ai">
                    <Sparkles className="h-3.5 w-3.5" /> Written by Gemini Flash from {evCount} evidence items
                    {brief.checkStatus === "verified" ? <span className="text-verified">· ✓ every claim cited</span> : <span className="text-change">· ⚠ needs review</span>}
                  </p>
                )}
                {brief?.unknowns && brief.unknowns.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4 text-[12.5px] text-muted"><span className="label mr-2">Not in the evidence</span>{brief.unknowns.join(" · ")}</div>
                )}
              </section>

              <OpenerCard companyId={company.id} text={brief?.openerText ?? null} ids={brief?.openerEvidenceIds ?? []} hook={brief?.hookType ?? null} status={brief?.checkStatus ?? null} reasons={brief?.checkReasons ?? []} evidence={evidence} />

              {brief?.talkingPoints && brief.talkingPoints.length > 0 && (
                <ul className="card divide-y divide-line">
                  {brief.talkingPoints.map((t, i) => (
                    <li key={i} className="flex gap-3 px-5 py-3.5 text-[14px]">
                      <span className="mono mt-0.5 text-faint">{i + 1}</span>
                      <span>{t.text} <ReceiptRow ids={t.evidence_ids} evidence={evidence} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <section className="card h-fit p-5" aria-labelledby="chg">
              <div className="mb-3 flex items-center justify-between"><h2 id="chg" className="label">What changed since last week</h2>{prevSnap ? <span className="mono text-[11px] text-faint">{prevSnap.createdAt.toISOString().slice(0, 10)} → {snap!.createdAt.toISOString().slice(0, 10)}</span> : <span className="mono text-[11px] text-faint">First week tracked</span>}</div>
              <DiffView changes={changes} evidence={evidence} />
              {goodWeek && <p className="mt-4 text-[13px] text-signal">→ {goodWeek}</p>}
            </section>
          </div>

          {/* ---------- tabs ---------- */}
          <div className="mt-10 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {TABS.map((t) => (
              <Link key={t.id} href={`/accounts/${company.domain}?tab=${t.id}`} scroll={false} role="tab" aria-selected={tab === t.id}
                className={cn("relative whitespace-nowrap px-4 py-2.5 text-[13.5px] text-muted hover:text-ink", tab === t.id && "text-ink")}>
                {t.label}
                {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal" />}
              </Link>
            ))}
          </div>
          <div className="pt-5">
            {tab === "evidence" && <EvidenceTab items={ev.map((e) => ({ ref: e.ref, source: e.source, kind: e.kind, title: e.title, snippet: e.snippet, url: e.url, observedAt: e.observedAt?.toISOString() ?? null, stale: !!(e.meta as { stale?: boolean } | null)?.stale }))} />}
            {tab === "sources" && (
              <SourcesTab
                companyId={company.id} org={company.githubOrg} orgConfidence={company.githubMatchConfidence} candidates={company.githubCandidates ?? []}
                jobProvider={company.jobBoardProvider} jobSlug={company.jobBoardSlug} blogRss={company.blogRssUrl} youtubeQuery={company.youtubeQuery} youtubeChannelId={youtubeChannelId} notes={company.notes}
                status={snap.sourceStatus ?? {}}
                matched={{
                  jobs: ev.find((e) => e.source === "jobs") ? `${new URL(ev.find((e) => e.source === "jobs")!.url).host}` : undefined,
                  blog: ev.find((e) => e.source === "blog") ? `${new URL(ev.find((e) => e.source === "blog")!.url).host}` : undefined,
                }}
              />
            )}
            {tab === "ask" && <AskWrapper companyId={company.id} evidence={evidence} hasData />}
            {tab === "history" && (
              <HistoryTab
                points={[...history].reverse().map((h) => ({ week: h.weekOf, commits30: h.activity?.commits30 ?? 0, openRoles: h.activity?.openRoles ?? 0, langs: Object.fromEntries((h.languages ?? []).map((l) => [l.name, l.share])) }))}
                langColors={Object.fromEntries(langs.map((l) => [l.name, l.color]))}
              />
            )}
            {tab === "runs" && <RunLog companyId={company.id} />}
          </div>
        </>
      )}
      {!snap && (
        <div className="mt-10">
          <div className="flex gap-1 border-b border-line">{TABS.filter((t) => t.id === "sources" || t.id === "runs").map((t) => (
            <Link key={t.id} href={`/accounts/${company.domain}?tab=${t.id}`} className={cn("px-4 py-2.5 text-[13.5px] text-muted hover:text-ink", tab === t.id && "text-ink")}>{t.label}</Link>
          ))}</div>
          <div className="pt-5">
            {tab === "runs" && <RunLog companyId={company.id} />}
            {tab === "sources" && <SourcesTab companyId={company.id} org={company.githubOrg} orgConfidence={company.githubMatchConfidence} candidates={company.githubCandidates ?? []} jobProvider={company.jobBoardProvider} jobSlug={company.jobBoardSlug} blogRss={company.blogRssUrl} youtubeQuery={company.youtubeQuery} youtubeChannelId={youtubeChannelId} notes={company.notes} status={{}} matched={{}} />}
          </div>
        </div>
      )}
    </div>
  );
}

async function AskWrapper({ companyId, evidence, hasData }: { companyId: number; evidence: ReturnType<typeof pickEvidence>; hasData: boolean }) {
  const qa = await getQa(companyId);
  return <AskTab companyId={companyId} history={qa.map((m) => ({ question: m.question, answer: m.answer }))} evidence={evidence} hasData={hasData} />;
}

async function RunLog({ companyId }: { companyId: number }) {
  const runs = await getRunsForCompany(companyId, 8);
  if (!runs.length) return <div className="card p-8 text-center text-[13px] text-muted">No runs yet.</div>;
  const G = { ok: ["✓", "text-verified"], warn: ["~", "text-change"], fail: ["✗", "text-alert"], skipped: ["–", "text-faint"], running: ["…", "text-ai"] } as const;
  return (
    <div className="space-y-4">
      {runs.map(({ run, steps }) => {
        const seen = new Map<string, (typeof steps)[number]>();
        for (const s of steps) seen.set(s.step, s);
        return (
          <div key={run.id} className="card overflow-hidden">
            <div className="mono flex items-center justify-between border-b border-line px-4 py-2.5 text-[11.5px] text-muted">
              <span>RUN #{run.id} · {run.trigger} · {timeAgo(run.startedAt)}</span><span className="capitalize">{run.status}</span>
            </div>
            <div className="mono space-y-0.5 bg-bg px-4 py-3 text-[12px] leading-6">
              {[...seen.values()].map((s) => (
                <div key={s.id} className="flex gap-3"><span className={G[s.status as keyof typeof G]?.[1]}>{G[s.status as keyof typeof G]?.[0]}</span><span className="flex-1 text-ink"><span className="text-muted">{s.step}</span> · {s.detail}</span><span className="text-faint">{s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : ""}</span></div>
              ))}
              {run.error && <div className="text-alert">{run.error}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
