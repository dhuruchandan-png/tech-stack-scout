import { Briefcase, FileText, GitBranch, MessageSquare, Mic, ExternalLink } from "lucide-react";
import { hostOf } from "@/lib/domain";

export type EvidenceLite = { ref: string; source: string; title: string; snippet: string; url: string; observedAt: Date | string | null };
export type EvidenceMap = Record<string, EvidenceLite>;

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  github: GitBranch, jobs: Briefcase, blog: FileText, youtube: Mic, hn: MessageSquare,
};
const SRC: Record<string, string> = { github: "GitHub", jobs: "Job board", blog: "Blog", youtube: "Talk", hn: "Hacker News" };

export function sourceLabel(s: string) {
  return SRC[s] ?? s;
}

function fmtDate(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** One citation chip. Hover or focus shows the source card (favicon, source, title, date, snippet, link). */
export function Receipt({ id, evidence }: { id: string; evidence?: EvidenceLite }) {
  if (!evidence) {
    return <span className="receipt opacity-50" title="Evidence not found">{id}</span>;
  }
  const Icon = ICON[evidence.source] ?? FileText;
  const host = hostOf(evidence.url);
  return (
    <span className="group relative inline-block">
      <a href={evidence.url} target="_blank" rel="noreferrer" className="receipt" aria-label={`Evidence ${id}: ${evidence.title}`}>
        {id}
      </a>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-card border border-line-strong bg-overlay p-3 text-left opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <span className="label flex items-center gap-1.5">
          {host && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" width={14} height={14} className="rounded-sm" />}
          <Icon className="h-3 w-3" />
          {sourceLabel(evidence.source)}
          {evidence.observedAt && <span>· {fmtDate(evidence.observedAt)}</span>}
          <span className="ml-auto">{id}</span>
        </span>
        <span className="mt-1.5 block text-[13px] font-semibold leading-snug text-ink">{evidence.title}</span>
        {evidence.snippet && <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-muted">{evidence.snippet}</span>}
        <span className="mt-2 flex items-center gap-1 text-[12px] text-signal">
          Open source <ExternalLink className="h-3 w-3" />
        </span>
      </span>
    </span>
  );
}

const CITE = /(\[E\d+(?:\s*,\s*E\d+)*\])/g;

/** Renders text with [E12] markers turned into receipt chips; the cited clause gets a dotted underline. */
export function CitedText({ text, evidence }: { text: string; evidence: EvidenceMap }) {
  const parts = text.split(CITE);
  const out: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    const m = part.match(/^\[(E\d+(?:\s*,\s*E\d+)*)\]$/);
    if (m) {
      for (const id of m[1].split(",").map((x) => x.trim())) out.push(<Receipt key={`${i}-${id}`} id={id} evidence={evidence[id]} />);
      return;
    }
    const nextIsCite = /^\[E\d/.test(parts[i + 1] ?? "");
    if (nextIsCite) {
      // underline the clause that the next citation supports
      const cut = Math.max(part.lastIndexOf(", "), part.lastIndexOf("; "), part.lastIndexOf(". "), part.lastIndexOf(": "));
      const head = cut >= 0 ? part.slice(0, cut + 2) : "";
      const tail = cut >= 0 ? part.slice(cut + 2) : part;
      out.push(<span key={i}>{head}<span className="cited">{tail}</span></span>);
    } else out.push(<span key={i}>{part}</span>);
  });
  return <>{out}</>;
}

export function ReceiptRow({ ids, evidence }: { ids: string[]; evidence: EvidenceMap }) {
  if (!ids?.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {ids.map((id) => <Receipt key={id} id={id} evidence={evidence[id]} />)}
    </span>
  );
}

export function pickEvidence(all: EvidenceLite[]): EvidenceMap {
  return Object.fromEntries(all.map((e) => [e.ref, e]));
}
