import { notFound } from "next/navigation";
import { PrintButton } from "@/components/account/PrintButton";
import { Fingerprint } from "@/components/viz/Fingerprint";
import { LanguageBar } from "@/components/viz/LanguageBar";
import { HeatStrip } from "@/components/viz/HeatStrip";
import { SetupNotice } from "@/components/ui/States";
import { stripCites } from "@/lib/ai/check";
import { dominantLanguages, pct } from "@/lib/compute/languages";
import { getAccountByDomain, getEvidence } from "@/lib/queries";
import { safe } from "@/lib/safe";

export const dynamic = "force-dynamic";
export const metadata = { title: "One-pager" };

const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 62);

export default async function OnePager({ params }: { params: Promise<{ slug: string }> }) {
  const domain = decodeURIComponent((await params).slug).toLowerCase();
  const res = await safe(() => getAccountByDomain(domain));
  if (!res.ok) return <SetupNotice error={res.error} />;
  if (!res.data) notFound();
  const { company, snapshot: s, brief } = res.data;
  if (!s) return <div className="py-20 text-center text-muted">No snapshot yet for {company.name}. Run a refresh first.</div>;
  const ev = await getEvidence(s.id);
  const langs = s.languages ?? [];
  const dom = dominantLanguages(langs);
  const a = s.activity;
  const asOf = s.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const cited = new Set([...(brief?.openerEvidenceIds ?? []), ...(brief?.talkingPoints ?? []).flatMap((t) => t.evidence_ids), ...[brief?.summaryP1, brief?.summaryP2].flatMap((p) => [...(p ?? "").matchAll(/E\d+/g)].map((m) => m[0]))]);
  const evList = ev.filter((e) => cited.has(e.ref));

  return (
    <div data-theme="light" className="-mx-4 min-h-screen bg-bg px-4 py-6 text-ink md:-mx-6 md:px-6 print:m-0 print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[794px] items-center justify-between"><span className="text-[13px] text-muted">Pre-call one-pager · A4, light theme</span><PrintButton /></div>
      <article className="print-sheet card mx-auto max-w-[794px] p-10 text-[12.5px] leading-relaxed" style={{ background: "#fff" }}>
        <header className="flex items-center gap-5 border-b border-line pb-5">
          <Fingerprint size={72} languages={langs.slice(0, 6)} categories={Object.keys(s.infra?.categories ?? {})} level={a?.level ?? "dormant"} />
          <div className="flex-1">
            <div className="label">Account one-pager</div>
            <h1 className="serif text-[34px] leading-none">{company.name}</h1>
            <div className="mono mt-1.5 text-[11px] text-muted">{company.domain}{company.githubOrg && ` · github.com/${company.githubOrg}`}</div>
          </div>
          <div className="text-right text-[11px] text-muted"><div>{asOf}</div><div className="capitalize">Confidence: {s.confidence}</div></div>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-input border border-line p-3">
            <div className="label">Q1 · Languages</div>
            <div className="serif mt-1 text-[22px]">{dom.map((d) => d.name).join(" + ") || "No public code"}</div>
            {langs.length > 0 && <div className="mt-2"><LanguageBar languages={langs.slice(0, 5)} compact /></div>}
            <div className="mono mt-1.5 text-[10.5px] text-muted">{langs.slice(0, 4).map((l) => `${l.name} ${pct(l.share)}%`).join(" · ")}</div>
          </div>
          <div className="rounded-input border border-line p-3">
            <div className="label">Q2 · Cloud & infra</div>
            <div className="mt-1 font-semibold">{(s.infra?.clouds ?? []).join(" · ") || "None detected"}</div>
            <div className="mt-1 text-muted">{Object.entries(s.infra?.categories ?? {}).map(([k, v]) => `${k}: ${v.slice(0, 2).join(", ")}`).join(" · ") || "No infra files found"}</div>
            <div className="mt-1.5 text-[11px]">Microservices: <b className="capitalize">{s.microservices?.level ?? "unknown"}</b></div>
          </div>
          <div className="rounded-input border border-line p-3">
            <div className="label">Q3 · Activity · <span className="capitalize">{a?.level}</span></div>
            <div className="mt-2"><HeatStrip series={s.commitSeries ?? []} size={9} /></div>
            <div className="mono mt-2 text-[10.5px] text-muted">{a?.commits30} commits 30d · {a?.reposPushed30} repos pushed · {a?.openRoles} open roles · {a?.blogPosts90} posts · {a?.talks12mo} talks</div>
          </div>
        </section>

        {brief?.summaryP1 && (
          <section className="mt-5">
            <div className="label mb-1.5">Engineering context</div>
            <div className="serif space-y-2.5 text-[14px] leading-[1.55]"><p>{brief.summaryP1}</p><p>{brief.summaryP2}</p></div>
          </section>
        )}
        {brief?.openerText && (
          <section className="mt-5 rounded-input border-l-[3px] border-ai bg-raised p-4">
            <div className="label !text-ai">Suggested first line</div>
            <p className="serif mt-1 text-[17px] leading-snug">“{stripCites(brief.openerText)}”</p>
          </section>
        )}
        {brief?.talkingPoints && brief.talkingPoints.length > 0 && (
          <section className="mt-5"><div className="label mb-1.5">Talking points</div>
            <ol className="list-decimal space-y-1 pl-5">{brief.talkingPoints.map((t, i) => <li key={i}>{t.text} <span className="mono text-[10px] text-signal">{t.evidence_ids.map((x) => `[${x}]`).join("")}</span></li>)}</ol>
          </section>
        )}
        <section className="mt-5"><div className="label mb-1.5">What changed since last week</div>
          <ul className="mono space-y-0.5 text-[11px]">{(s.changes ?? []).map((c, i) => <li key={i}><span className={c.sign === "+" ? "text-verified" : c.sign === "-" ? "text-alert" : "text-change"}>{c.sign}</span> {c.text}</li>)}</ul>
        </section>
        {evList.length > 0 && (
          <section className="mt-5"><div className="label mb-1.5">Evidence</div>
            <ul className="space-y-0.5 text-[10.5px]">{evList.map((e) => <li key={e.ref}><span className="mono text-signal">[{e.ref}]</span> {e.title} <span className="mono text-muted">· {short(e.url)}</span></li>)}</ul>
          </section>
        )}
        <footer className="mt-6 border-t border-line pt-3 text-[10.5px] text-muted">Prepared by Tech Stack Scout · data as of {asOf} · Written by Gemini Flash from evidence, checked in code.</footer>
      </article>
    </div>
  );
}
