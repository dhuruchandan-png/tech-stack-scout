"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quadrant, Ring, RadarItem } from "@/lib/compute/radar";
import { QUADRANT_LABEL } from "@/lib/compute/radar";

const RINGS: { id: Ring; label: string; r0: number; r1: number }[] = [
  { id: "everywhere", label: "Everywhere", r0: 0, r1: 90 },
  { id: "common", label: "Common", r0: 90, r1: 165 },
  { id: "emerging", label: "Emerging", r0: 165, r1: 235 },
  { id: "rare", label: "Rare", r0: 235, r1: 290 },
];
// quadrant -> start angle (deg), clockwise from top-right quadrant
const QUAD: Record<Quadrant, { a0: number; color: string }> = {
  languages: { a0: -90, color: "rgb(var(--signal))" },
  cloud: { a0: 0, color: "rgb(var(--ai))" },
  infra: { a0: 90, color: "rgb(var(--change))" },
  data: { a0: 180, color: "rgb(var(--verified))" },
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

export function TechRadar({ items }: { items: RadarItem[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<RadarItem | null>(null);
  const [only, setOnly] = useState<Quadrant | null>(null);

  const placed = useMemo(() => {
    const out: { it: RadarItem; x: number; y: number }[] = [];
    const perCell = new Map<string, number>();
    for (const it of items) {
      const ring = RINGS.find((r) => r.id === it.ring)!;
      const q = QUAD[it.quadrant];
      const cell = `${it.quadrant}:${it.ring}`;
      const n = perCell.get(cell) ?? 0;
      perCell.set(cell, n + 1);
      if (n > 14) continue; // keep the radar legible; the table lists everything
      const angle = (q.a0 + 8 + hash(it.name + "a") * 74) * (Math.PI / 180);
      const rad = ring.r0 + 14 + hash(it.name + "r") * (ring.r1 - ring.r0 - 28);
      out.push({ it, x: 300 + rad * Math.cos(angle), y: 300 + rad * Math.sin(angle) });
    }
    return out;
  }, [items]);

  const summary = `Tech radar: ${items.length} tools. ${RINGS.map((r) => `${items.filter((i) => i.ring === r.id).length} ${r.label.toLowerCase()}`).join(", ")}.`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(QUAD) as Quadrant[]).map((q) => (
          <button key={q} className={`chip ${only === q ? "border-signal bg-signal/10 text-signal" : ""}`} onClick={() => setOnly(only === q ? null : q)}>
            <span className="h-2 w-2 rounded-full" style={{ background: QUAD[q].color }} />{QUADRANT_LABEL[q]}
          </button>
        ))}
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-[640px]">
        <svg viewBox="0 0 600 600" className="h-full w-full" role="img" aria-label={summary}>
          {[...RINGS].reverse().map((r) => <circle key={r.id} cx="300" cy="300" r={r.r1} fill="none" stroke="rgb(var(--border-strong))" strokeWidth="1" strokeDasharray={r.id === "rare" ? "3 5" : undefined} />)}
          <line x1="10" y1="300" x2="590" y2="300" stroke="rgb(var(--border-strong))" /><line x1="300" y1="10" x2="300" y2="590" stroke="rgb(var(--border-strong))" />
          {RINGS.map((r) => <text key={r.id} x="304" y={300 - r.r1 + 12} fontSize="9" className="mono" fill="rgb(var(--text-faint))" letterSpacing="1">{r.label.toUpperCase()}</text>)}
          <text x="470" y="26" fontSize="10" className="mono" fill="rgb(var(--signal))" letterSpacing="1">LANGUAGES</text>
          <text x="400" y="584" fontSize="10" className="mono" fill="rgb(var(--ai))" letterSpacing="1">CLOUD & PLATFORMS</text>
          <text x="14" y="584" fontSize="10" className="mono" fill="rgb(var(--change))" letterSpacing="1">INFRA & ORCHESTRATION</text>
          <text x="14" y="26" fontSize="10" className="mono" fill="rgb(var(--verified))" letterSpacing="1">DATA & MESSAGING</text>
          {placed.map(({ it, x, y }) => {
            const dim = only && only !== it.quadrant;
            const r = 4 + Math.min(it.count, 8) * 0.7;
            return (
              <g key={`${it.quadrant}-${it.name}`} opacity={dim ? 0.12 : 1} className={it.filter ? "cursor-pointer" : ""}
                onMouseEnter={() => setHover(it)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(it)} onBlur={() => setHover(null)}
                onClick={() => it.filter && router.push(`/accounts?${it.filter.key}=${encodeURIComponent(it.filter.value)}`)}
                tabIndex={0} role="button" aria-label={`${it.name}: ${it.count} accounts, ${it.ring}`}
                onKeyDown={(e) => e.key === "Enter" && it.filter && router.push(`/accounts?${it.filter.key}=${encodeURIComponent(it.filter.value)}`)}>
                <circle cx={x} cy={y} r={r} fill={QUAD[it.quadrant].color} fillOpacity=".85" stroke="rgb(var(--bg))" strokeWidth="1.5" />
                <text x={x + r + 4} y={y + 3.5} fontSize="10.5" fill="rgb(var(--text))" pointerEvents="none">{it.name}</text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="card pointer-events-none absolute left-2 top-2 z-10 max-w-[260px] !bg-overlay p-3 text-[12.5px]">
            <div className="font-semibold">{hover.name}</div>
            <div className="text-muted">{QUADRANT_LABEL[hover.quadrant]} · {hover.ring} · {hover.count} account{hover.count === 1 ? "" : "s"}</div>
            <div className="mt-1.5 text-[12px] text-muted">{hover.accounts.slice(0, 8).map((a) => a.name).join(", ")}{hover.accounts.length > 8 && ` +${hover.accounts.length - 8}`}</div>
            {hover.filter && <div className="mt-1.5 text-[11.5px] text-signal">Click to filter the Watchlist</div>}
          </div>
        )}
      </div>
    </div>
  );
}
