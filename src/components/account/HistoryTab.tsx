"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type HistoryPoint = { week: string; commits30: number; openRoles: number; langs: Record<string, number> };

const AX = { stroke: "rgb(var(--text-faint))", fontSize: 11 };
const tip = { contentStyle: { background: "rgb(var(--overlay))", border: "1px solid rgb(var(--border-strong))", borderRadius: 8, fontSize: 12, color: "rgb(var(--text))" } };

export function HistoryTab({ points, langColors }: { points: HistoryPoint[]; langColors: Record<string, string> }) {
  if (points.length < 2) {
    return <div className="card p-8 text-center text-[13px] text-muted">History builds up weekly. Come back after the next Monday refresh to see trends.</div>;
  }
  const topLangs = Object.entries(points[points.length - 1].langs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  const lang = points.map((p) => ({ week: p.week, ...Object.fromEntries(topLangs.map((l) => [l, Math.round((p.langs[l] ?? 0) * 100)])) }));
  const summary = `Language share and activity over ${points.length} snapshots. Latest: ${topLangs.map((l) => `${l} ${Math.round((points[points.length - 1].langs[l] ?? 0) * 100)}%`).join(", ")}; ${points[points.length - 1].commits30} commits in 30 days; ${points[points.length - 1].openRoles} open engineering roles.`;
  return (
    <div className="grid gap-6 lg:grid-cols-2" role="group" aria-label={summary}>
      <div className="card p-5">
        <div className="label mb-3">Language share · % of code</div>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={lang}>
              <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="week" {...AX} tickFormatter={(w: string) => w.slice(5)} />
              <YAxis {...AX} unit="%" width={36} />
              <Tooltip {...tip} />
              {topLangs.map((l) => <Line key={l} type="monotone" dataKey={l} stroke={langColors[l] ?? "#8C9AA9"} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[12px]">{topLangs.map((l) => <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: langColors[l] ?? "#8C9AA9" }} />{l}</span>)}</div>
      </div>
      <div className="card p-5">
        <div className="label mb-3">Activity · commits (30d) and open roles</div>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={points}>
              <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="week" {...AX} tickFormatter={(w: string) => w.slice(5)} />
              <YAxis {...AX} width={36} />
              <Tooltip {...tip} />
              <Line type="monotone" dataKey="commits30" name="Commits 30d" stroke="rgb(var(--signal))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="openRoles" name="Open eng roles" stroke="rgb(var(--ai))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-[12px]"><span className="text-signal">● Commits 30d</span><span className="text-ai">● Open eng roles</span></div>
      </div>
    </div>
  );
}
