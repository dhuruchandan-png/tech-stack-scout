import { Database } from "lucide-react";

/** Fine-line radar-sweep illustration for empty states. */
export function RadarIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      {[48, 36, 24, 12].map((r) => (
        <circle key={r} cx="60" cy="60" r={r} stroke="rgb(var(--border-strong))" strokeWidth="1" />
      ))}
      <path d="M60 12v96M12 60h96" stroke="rgb(var(--border))" strokeWidth="1" />
      <path d="M60 60 L100 34 A48 48 0 0 1 108 60 Z" fill="rgb(var(--signal) / .14)" stroke="rgb(var(--signal) / .5)" strokeWidth="1" />
      <circle cx="84" cy="42" r="3" fill="rgb(var(--signal))" />
      <circle cx="42" cy="78" r="2" fill="rgb(var(--ai))" />
      <circle cx="60" cy="60" r="2.5" fill="rgb(var(--text))" />
    </svg>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <RadarIllustration />
      <p className="serif text-[22px] text-ink">{title}</p>
      {hint && <p className="max-w-md text-[13px] text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer ${className}`} aria-hidden="true" />;
}

/** Shown when DATABASE_URL is missing or the schema has not been applied yet. */
export function SetupNotice({ error }: { error: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-2xl p-8">
      <Database className="mb-3 h-6 w-6 text-change" />
      <h2 className="serif text-[26px]">Connect your database</h2>
      <p className="mt-2 text-[13px] text-muted">
        Tech Stack Scout could not read from Neon. Set <span className="mono text-ink">DATABASE_URL</span>, then paste <span className="mono text-ink">drizzle/0000_init.sql</span> into the Neon SQL editor.
      </p>
      <pre className="mono mt-4 overflow-x-auto rounded-input border border-line bg-bg p-3 text-[12px] text-change">{error}</pre>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-7">
      <div>
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h1 className="serif text-[34px] leading-tight">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
