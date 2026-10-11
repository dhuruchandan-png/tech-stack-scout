import type { ChangeItem } from "@/db/schema";
import { cn } from "@/lib/util";
import { ReceiptRow, type EvidenceMap } from "./Receipts";

const STYLE = {
  "+": { row: "bg-verified/10 text-ink", sign: "text-verified" },
  "-": { row: "bg-alert/10 text-ink", sign: "text-alert" },
  "~": { row: "bg-change/10 text-ink", sign: "text-change" },
} as const;

/** Git-diff styled "what changed". Green +, amber ~, red −, each with its receipts. */
export function DiffView({ changes, evidence, prefix }: { changes: ChangeItem[]; evidence: EvidenceMap; prefix?: (c: ChangeItem) => React.ReactNode }) {
  return (
    <ul className="space-y-1.5" aria-label="What changed since last week">
      {changes.map((c, i) => (
        <li key={i} className={cn("mono flex items-start gap-3 rounded-[6px] px-3 py-2 text-[12.5px] leading-5", STYLE[c.sign].row)}>
          <span className={cn("w-3 shrink-0 font-bold", STYLE[c.sign].sign)}>{c.sign === "-" ? "−" : c.sign}</span>
          <span className="min-w-0 flex-1">
            {prefix?.(c)}
            {c.text} {c.evidenceIds && <ReceiptRow ids={c.evidenceIds.slice(0, 3)} evidence={evidence} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Good week to call: …" one-liner derived in code from the changes. */
export function goodWeekLine(changes: ChangeItem[]): string | null {
  const hiring = changes.find((c) => /role/i.test(c.text) && c.sign === "+");
  const blog = changes.find((c) => /^Blog:/i.test(c.text));
  const talk = changes.find((c) => /^Talk:/i.test(c.text));
  const bits = [hiring && "fresh hiring", blog && "a new public post", talk && "a new talk"].filter(Boolean) as string[];
  if (!bits.length) return null;
  return `Good week to call: ${bits.join(" + ")}.`;
}
