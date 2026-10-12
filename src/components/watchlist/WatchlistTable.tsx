"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Bookmark, Columns3, Plus, RefreshCw, Rows3, Search, Trash2 } from "lucide-react";
import { removeCompanies, undoRemove } from "@/app/actions";
import { Fingerprint } from "@/components/viz/Fingerprint";
import { LanguageBar } from "@/components/viz/LanguageBar";
import { Sparkline } from "@/components/viz/HeatStrip";
import { ActivityBadge, CheckBadge, ConfidenceMeter, FreshnessPill, HubspotBadge, MicroservicesBadge } from "@/components/ui/Pills";
import { EmptyState, PageHeader } from "@/components/ui/States";
import { useRuns } from "@/components/run/RunConsole";
import { AddCompanyDrawer } from "./AddCompanyDrawer";
import { cn, freshnessOf } from "@/lib/util";

export type Row = {
  id: number; name: string; domain: string;
  languages: { name: string; color: string; share: number }[];
  clouds: string[]; tools: string[]; categories: string[];
  microservices: string; activity: string; series: number[];
  confidence: string | null; confidenceReason: string | null;
  snapshotAt: string | null; staleSource: { source: string; since: string } | null;
  opener: string | null; hubspot: string; hubspotError: string | null; changed: boolean;
};

type Filters = { q: string; cloud: string; lang: string; tool: string; ms: string; activity: string; confidence: string; changed: boolean };
const EMPTY: Filters = { q: "", cloud: "", lang: "", tool: "", ms: "", activity: "", confidence: "", changed: false };
type SortKey = "name" | "activity" | "confidence" | "freshness" | "microservices";
const ORDER = { high: 3, medium: 2, low: 1, dormant: 0 } as Record<string, number>; // activity and confidence
const MS_ORDER = { strong: 4, medium: 3, some: 3, weak: 2, none: 1, unknown: 0 } as Record<string, number>; // microservices signal

const COLS = [
  { key: "q1", label: "Q1 · Languages" }, { key: "q2", label: "Q2 · Cloud & infra" }, { key: "ms", label: "Microservices" },
  { key: "q3", label: "Q3 · Activity" }, { key: "conf", label: "Confidence" }, { key: "fresh", label: "Freshness" },
  { key: "opener", label: "First line" }, { key: "hubspot", label: "HubSpot" },
] as const;
type ColKey = (typeof COLS)[number]["key"];

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ }
}

export function WatchlistTable({ rows, removed, openAdd, initial }: { rows: Row[]; removed: { id: number; name: string; domain: string }[]; openAdd: boolean; initial: { cloud: string; lang: string; tool: string } }) {
  const router = useRouter();
  const { refresh, refreshMany } = useRuns();
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, ...initial });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [hidden, setHidden] = useState<ColKey[]>([]);
  const [compact, setCompact] = useState(false);
  const [views, setViews] = useState<{ name: string; f: Filters }[]>([]);
  const [drawer, setDrawer] = useState(openAdd);
  const [cursor, setCursor] = useState(0);
  const [colMenu, setColMenu] = useState(false);
  const [pending, start] = useTransition();
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => { setHidden(load("tss-cols", [])); setCompact(load("tss-compact", false)); setViews(load("tss-views", [])); }, []);

  const opts = useMemo(() => ({
    clouds: [...new Set(rows.flatMap((r) => r.clouds))].sort(),
    langs: [...new Set(rows.flatMap((r) => r.languages.map((l) => l.name)))].sort(),
    tools: [...new Set(rows.flatMap((r) => r.tools))].sort(),
  }), [rows]);

  const shown = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const out = rows.filter((r) =>
      (!q || r.name.toLowerCase().includes(q) || r.domain.includes(q)) &&
      (!filters.cloud || r.clouds.includes(filters.cloud)) &&
      (!filters.lang || r.languages.some((l) => l.name === filters.lang)) &&
      (!filters.tool || r.tools.includes(filters.tool)) &&
      (!filters.ms || r.microservices === filters.ms) &&
      (!filters.activity || r.activity === filters.activity) &&
      (!filters.confidence || r.confidence === filters.confidence) &&
      (!filters.changed || r.changed),
    );
    const val = (r: Row) =>
      sort.key === "name" ? r.name.toLowerCase()
      : sort.key === "activity" ? ORDER[r.activity] ?? 0
      : sort.key === "confidence" ? ORDER[r.confidence ?? "low"] ?? 0
      : sort.key === "microservices" ? MS_ORDER[r.microservices] ?? 0
      : r.snapshotAt ? new Date(r.snapshotAt).getTime() : 0;
    return out.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [rows, filters, sort]);

  // keyboard: J/K move, Enter opens, R refreshes the focused row
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "") || e.metaKey || e.ctrlKey || drawer) return;
      const k = e.key.toLowerCase();
      if (k === "j") setCursor((c) => Math.min(c + 1, shown.length - 1));
      else if (k === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (k === "enter" && shown[cursor]) router.push(`/accounts/${shown[cursor].domain}`);
      else if (k === "r" && shown[cursor]) refresh(shown[cursor].id, shown[cursor].name);
      else if (k === "/") { e.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, cursor, router, refresh, drawer]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  const toggleSel = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const show = (k: ColKey) => !hidden.includes(k);
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== "q").length;

  const doRemove = (ids: number[]) =>
    start(async () => {
      const r = await removeCompanies(ids);
      if (!r.ok) { toast.error(r.error); return; }
      setSel(new Set());
      toast(`Removed ${ids.length} ${ids.length === 1 ? "company" : "companies"}.`, {
        action: { label: "Undo", onClick: async () => { await undoRemove(ids); router.refresh(); } },
      });
      router.refresh();
    });

  const confirmRemove = (ids: number[]) => {
    if (window.confirm(`Remove ${ids.length} ${ids.length === 1 ? "company" : "companies"} from the watchlist? You can undo for 30 days.`)) doRemove(ids);
  };

  const Th = ({ label, k, className }: { label: string; k?: SortKey; className?: string }) => (
    <th className={cn("label whitespace-nowrap px-3 py-3 text-left font-normal", className)}>
      {k ? (
        <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort(k)}>
          {label}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : label}
    </th>
  );

  const pad = compact ? "py-2" : "py-3.5";

  return (
    <div>
      <PageHeader eyebrow={`${rows.length} accounts · live data`} title="Watchlist">
        <button className="btn" onClick={() => refreshMany()} disabled={!rows.length}><RefreshCw className="h-3.5 w-3.5" /> Refresh all</button>
        <button className="btn btn-primary" onClick={() => setDrawer(true)}><Plus className="h-4 w-4" /> Add company</button>
      </PageHeader>

      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
          <input ref={search} className="input !pl-9" placeholder="Filter accounts  /" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} aria-label="Filter accounts" />
        </div>
        {[
          { k: "cloud", label: "Cloud", opts: opts.clouds }, { k: "lang", label: "Language", opts: opts.langs }, { k: "tool", label: "Infra tool", opts: opts.tools },
          { k: "ms", label: "Microservices", opts: ["strong", "medium", "weak", "none", "unknown"] }, { k: "activity", label: "Activity", opts: ["high", "medium", "low", "dormant"] },
          { k: "confidence", label: "Confidence", opts: ["high", "medium", "low"] },
        ].map((f) => (
          <select key={f.k} className="input !w-auto !pr-8 capitalize" value={(filters as unknown as Record<string, string>)[f.k]} onChange={(e) => setFilters({ ...filters, [f.k]: e.target.value })} aria-label={f.label}>
            <option value="">{f.label}: any</option>
            {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <label className="chip cursor-pointer select-none"><input type="checkbox" checked={filters.changed} onChange={(e) => setFilters({ ...filters, changed: e.target.checked })} /> Changed this week</label>
        {(activeFilters > 0 || filters.q) && <button className="btn btn-ghost" onClick={() => setFilters(EMPTY)}>Clear</button>}

        <div className="ml-auto flex items-center gap-2">
          <button className="btn" title="Save current filters as a view" onClick={() => {
            const name = window.prompt("Name this view");
            if (!name) return;
            const next = [...views.filter((v) => v.name !== name), { name, f: filters }];
            setViews(next); save("tss-views", next);
          }}><Bookmark className="h-3.5 w-3.5" /> Save view</button>
          <button className={cn("btn", compact && "border-signal text-signal")} onClick={() => { setCompact(!compact); save("tss-compact", !compact); }} title="Compact rows"><Rows3 className="h-3.5 w-3.5" /></button>
          <div className="relative">
            <button className="btn" onClick={() => setColMenu(!colMenu)} title="Columns"><Columns3 className="h-3.5 w-3.5" /></button>
            {colMenu && (
              <div className="card absolute right-0 top-10 z-30 w-52 p-2">
                {COLS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-input px-2 py-1.5 text-[13px] hover:bg-raised">
                    <input type="checkbox" checked={show(c.key)} onChange={() => { const n = show(c.key) ? [...hidden, c.key] : hidden.filter((h) => h !== c.key); setHidden(n); save("tss-cols", n); }} /> {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {views.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="label">Saved views</span>
          {views.map((v) => (
            <span key={v.name} className="chip">
              <button onClick={() => setFilters(v.f)}>{v.name}</button>
              <button className="text-faint hover:text-alert" aria-label={`Delete view ${v.name}`} onClick={() => { const n = views.filter((x) => x.name !== v.name); setViews(n); save("tss-views", n); }}>×</button>
            </span>
          ))}
        </div>
      )}

      {sel.size > 0 && (
        <div className="card mb-3 flex items-center gap-3 border-signal/40 px-4 py-2.5">
          <span className="text-[13px]">{sel.size} selected</span>
          <button className="btn" onClick={() => { refreshMany([...sel]); setSel(new Set()); }}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          <button className="btn text-alert" onClick={() => confirmRemove([...sel])} disabled={pending}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
          <button className="btn btn-ghost ml-auto" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card"><EmptyState title="Your watchlist is empty." hint="Add a company to start scouting." action={<button className="btn btn-primary" onClick={() => setDrawer(true)}>Add a company</button>} /></div>
      ) : shown.length === 0 ? (
        <div className="card"><EmptyState title="No accounts match these filters." hint="Clear a filter to see more." action={<button className="btn" onClick={() => setFilters(EMPTY)}>Clear filters</button>} /></div>
      ) : (
        <>
          {/* desktop table */}
          <div className="card hidden overflow-x-auto min-[900px]:block">
            <table className="w-full min-w-[1100px] border-collapse text-[13px]">
              <thead className="border-b border-line">
                <tr>
                  <th className="w-10 px-3"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(shown.map((r) => r.id)))} aria-label="Select all" /></th>
                  <Th label="Company" k="name" />
                  {show("q1") && <Th label="Q1 · Languages" className="w-[200px]" />}
                  {show("q2") && <Th label="Q2 · Cloud & infra" />}
                  {show("ms") && <Th label="Microservices" k="microservices" />}
                  {show("q3") && <Th label="Q3 · Activity" k="activity" />}
                  {show("conf") && <Th label="Confidence" k="confidence" />}
                  {show("fresh") && <Th label="Freshness" k="freshness" />}
                  {show("opener") && <Th label="First line" />}
                  {show("hubspot") && <Th label="HubSpot" />}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.id} className={cn("group cursor-pointer border-b border-line last:border-0 hover:bg-raised/60", i === cursor && "bg-raised/80 shadow-[inset_2px_0_0_rgb(var(--signal))]")} onClick={() => router.push(`/accounts/${r.domain}`)}>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} aria-label={`Select ${r.name}`} /></td>
                    <td className={cn("px-3", pad)}>
                      <div className="flex items-center gap-3">
                        <Fingerprint size={compact ? 24 : 30} languages={r.languages} categories={r.categories} level={r.activity} />
                        <div className="min-w-0">
                          <Link href={`/accounts/${r.domain}`} className="block max-w-[190px] truncate font-semibold hover:text-signal" title={r.name} onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                          <div className="mono max-w-[190px] truncate text-[11px] text-faint">{r.domain}</div>
                        </div>
                        {r.changed && <span className="chip border-change/40 bg-change/10 !px-1.5 text-[10px] text-change" title="Changed this week">new</span>}
                      </div>
                    </td>
                    {show("q1") && <td className={cn("px-3", pad)}>{r.languages.length ? <LanguageBar languages={r.languages} compact max={3} /> : <span className="text-faint">No public code</span>}
                      {r.languages.length > 0 && <div className="mono mt-1 text-[11px] text-muted">{r.languages.slice(0, 3).map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(" · ")}</div>}</td>}
                    {show("q2") && <td className={cn("px-3", pad)}>
                      <div className="flex max-w-[240px] flex-wrap gap-1">
                        {r.clouds.slice(0, 3).map((c) => <span key={c} className="chip !py-0 text-[11.5px]">{c}</span>)}
                        {r.tools.filter((t) => ["Kubernetes", "Terraform", "Helm", "Docker", "gRPC / protobuf"].includes(t)).slice(0, 3).map((t) => <span key={t} className="chip !py-0 text-[11.5px] text-muted">{t}</span>)}
                        {!r.clouds.length && !r.tools.length && <span className="text-faint">none detected</span>}
                      </div></td>}
                    {show("ms") && <td className={cn("px-3", pad)}><MicroservicesBadge level={r.microservices} /></td>}
                    {show("q3") && <td className={cn("px-3", pad)}><div className="flex items-center gap-2"><Sparkline series={r.series} /><ActivityBadge level={r.activity} /></div></td>}
                    {show("conf") && <td className={cn("px-3", pad)}><ConfidenceMeter level={r.confidence} reason={r.confidenceReason} inline /></td>}
                    {show("fresh") && <td className={cn("px-3", pad)}><FreshnessPill at={r.snapshotAt} staleSince={r.staleSource} /></td>}
                    {show("opener") && <td className={cn("px-3", pad)}><CheckBadge status={r.opener} /></td>}
                    {show("hubspot") && <td className={cn("px-3", pad)}><HubspotBadge status={r.hubspot} error={r.hubspotError} /></td>}
                    <td className="px-2" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost h-8 w-8 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => refresh(r.id, r.name)} aria-label={`Refresh ${r.name}`}><RefreshCw className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="grid gap-3 min-[900px]:hidden">
            {shown.map((r) => (
              <Link key={r.id} href={`/accounts/${r.domain}`} className="card block p-4">
                <div className="flex items-center gap-3">
                  <Fingerprint size={40} languages={r.languages} categories={r.categories} level={r.activity} />
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.name}</div><div className="mono truncate text-[11px] text-faint">{r.domain}</div></div>
                  <ActivityBadge level={r.activity} />
                </div>
                <div className="mt-3"><LanguageBar languages={r.languages} compact max={4} /></div>
                <div className="mt-3 flex flex-wrap gap-2"><ConfidenceMeter level={r.confidence} reason={r.confidenceReason} inline /><FreshnessPill at={r.snapshotAt} staleSince={r.staleSource} /><CheckBadge status={r.opener} /></div>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-[12px] text-faint">Also editable directly in Neon → <span className="mono">companies</span> table. <span className="kbd">J</span> <span className="kbd">K</span> move · <span className="kbd">Enter</span> open · <span className="kbd">R</span> refresh</p>

      {removed.length > 0 && (
        <div className="mt-6">
          <div className="label mb-2">Removed · undo available for 30 days</div>
          <div className="flex flex-wrap gap-2">
            {removed.map((r) => (
              <span key={r.id} className="chip">{r.name} <button className="text-signal hover:underline" onClick={async () => { const x = await undoRemove([r.id]); if (!x.ok) toast.error(x.error); else router.refresh(); }}>Undo</button></span>
            ))}
          </div>
        </div>
      )}

      <AddCompanyDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
