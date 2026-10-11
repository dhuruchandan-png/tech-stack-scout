"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askQuestion } from "@/app/actions";
import { CitedText, type EvidenceMap } from "@/components/ui/Receipts";

type Msg = { question: string; answer: string };

export function AskTab({ companyId, history, evidence, hasData }: { companyId: number; history: Msg[]; evidence: EvidenceMap; hasData: boolean }) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const examples = ["Do they run Kubernetes?", "What are they hiring for?", "Which cloud do they use?", "Anything recent on CI or build speed?"];

  const ask = (question: string) =>
    start(async () => {
      const r = await askQuestion(companyId, question);
      if (!r.ok) { toast.error(r.error); return; }
      setQ("");
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-[12.5px] text-muted"><Sparkles className="h-3.5 w-3.5 text-ai" /> Answers come only from this account&apos;s evidence, with receipts.</div>
        <div className="flex gap-2">
          <input className="input" placeholder="Ask about how they build…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && ask(q)} disabled={!hasData} aria-label="Question" />
          <button className="btn btn-primary" disabled={pending || !q.trim() || !hasData} onClick={() => ask(q)}><Send className="h-3.5 w-3.5" /> {pending ? "Thinking…" : "Ask"}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((e) => <button key={e} className="chip hover:border-signal" disabled={!hasData || pending} onClick={() => ask(e)}>{e}</button>)}
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {history.length === 0 && <p className="text-center text-[13px] text-muted">{hasData ? "No questions yet." : "Run a refresh first so there is evidence to ask about."}</p>}
        {history.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] rounded-card bg-raised px-4 py-2.5 text-[13.5px]">{m.question}</div>
            <div className="card max-w-[92%] p-4 text-[14px] leading-relaxed">
              {/^not in the evidence yet/i.test(m.answer)
                ? <><span className="font-medium text-change">Not in the evidence yet.</span> <span className="text-muted">Their blog might cover this; try Refresh.</span></>
                : <CitedText text={m.answer} evidence={evidence} />}
              <div className="label mt-2 !text-ai">Gemini Flash · evidence only</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
