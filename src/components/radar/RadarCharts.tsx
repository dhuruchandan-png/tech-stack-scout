"use client";

import Link from "next/link";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AX = { stroke: "rgb(var(--text-faint))", fontSize: 11 };
const tip = { contentStyle: { background: "rgb(var(--overlay))", border: "1px solid rgb(var(--border-strong))", borderRadius: 8, fontSize: 12, color: "rgb(var(--text))" } };
const CLOUD_COLORS = ["rgb(var(--signal))", "rgb(var(--ai))", "rgb(var(--change))", "rgb(var(--verified))", "rgb(var(--human))", "rgb(var(--text-muted))"];

export function RadarCharts({ languages, clouds, hiring }: {
  languages: { name: string; color: string; avg: number; accounts: number }[];
  clouds: { name: string; value: number }[];
  hiring: { week: string; roles: number }[];
}) {
  const max = Math.max(...languages.map((l) => l.avg), 0.01);
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="label mb-4">Languages across your watchlist · average share of code</div>
        <ul className="space-y-2.5" aria-label="Languages across your watchlist">
          {languages.map((l) => (
            <li key={l.name} className="flex items-center gap-3 text-[13px]">
              <Link href={`/accounts?lang=${encodeURIComponent(l.name)}`} className="w-24 shrink-0 truncate hover:text-signal">{l.name}</Link>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full" style={{ width: `${(l.avg / max) * 100}%`, background: l.color }} /></div>
              <span className="mono w-24 shrink-0 text-right text-[12px] text-muted">{Math.round(l.avg * 100)}% · {l.accounts} acct{l.accounts === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="card p-5">
          <div className="label mb-2">Cloud split · accounts</div>
          {clouds.length === 0 ? <p className="py-10 text-center text-[13px] text-muted">No cloud signals yet.</p> : (
            <>
              <div className="h-40" role="img" aria-label={`Cloud split: ${clouds.map((c) => `${c.name} ${c.value}`).join(", ")}`}>
                <ResponsiveContainer>
                  <PieChart><Pie data={clouds} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
                    {clouds.map((c, i) => <Cell key={c.name} fill={CLOUD_COLORS[i % CLOUD_COLORS.length]} />)}
                  </Pie><Tooltip {...tip} /></PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-1 space-y-1 text-[12.5px]">
                {clouds.map((c, i) => <li key={c.name} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: CLOUD_COLORS[i % CLOUD_COLORS.length] }} /><Link href={`/accounts?cloud=${encodeURIComponent(c.name)}`} className="hover:text-signal">{c.name}</Link><span className="mono ml-auto text-muted">{c.value}</span></li>)}
              </ul>
            </>
          )}
        </section>

        <section className="card p-5">
          <div className="label mb-2">Hiring momentum · open eng roles</div>
          {hiring.length < 2 ? <p className="py-10 text-center text-[13px] text-muted">The trend line appears after two weekly snapshots.</p> : (
            <div className="h-52" role="img" aria-label={`Open engineering roles by week: ${hiring.map((h) => `${h.week} ${h.roles}`).join(", ")}`}>
              <ResponsiveContainer>
                <LineChart data={hiring}>
                  <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="week" {...AX} tickFormatter={(w: string) => w.slice(5)} />
                  <YAxis {...AX} width={30} />
                  <Tooltip {...tip} />
                  <Line type="monotone" dataKey="roles" name="Open eng roles" stroke="rgb(var(--ai))" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
