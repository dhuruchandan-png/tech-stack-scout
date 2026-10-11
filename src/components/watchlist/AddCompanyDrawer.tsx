"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { addCompany } from "@/app/actions";
import { useRuns } from "@/components/run/RunConsole";
import { normalizeDomain } from "@/lib/domain";

export function AddCompanyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [refreshNow, setRefreshNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { refresh } = useRuns();

  const clean = normalizeDomain(site);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await addCompany(name, site);
      if (!r.ok) { setError(r.error); return; }
      toast.success(`${name.trim()} added to the watchlist.`);
      setName(""); setSite("");
      onClose();
      router.refresh();
      if (refreshNow) await refresh(r.id, name.trim());
    });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-line-strong bg-surface" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.2, ease: "easeOut" }} role="dialog" aria-label="Add company">
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="serif text-[22px]">Add a company</h2>
              <button className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div>
                <label className="label mb-1.5 block" htmlFor="co-name">Company name</label>
                <input id="co-name" className="input" placeholder="Razorpay" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label mb-1.5 block" htmlFor="co-site">Website</label>
                <input id="co-site" className="input" placeholder="https://www.razorpay.com/" value={site} onChange={(e) => setSite(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name && clean && submit()} />
                <div className="mono mt-1.5 flex h-5 items-center gap-1.5 text-[12px]">
                  {site && (clean ? <><Check className="h-3 w-3 text-verified" /><span className="text-verified">{clean}</span></> : <span className="text-change">That does not look like a website yet</span>)}
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                <input type="checkbox" className="mt-0.5" checked={refreshNow} onChange={(e) => setRefreshNow(e.target.checked)} />
                <span>Run a refresh immediately<span className="block text-muted">Pulls GitHub, jobs, blog, talks and Hacker News, then drafts the brief. About a minute.</span></span>
              </label>
              {error && <div className="rounded-input border border-change/40 bg-change/10 px-3 py-2 text-[13px] text-change">{error}</div>}
            </div>
            <footer className="flex gap-2 border-t border-line p-4">
              <button className="btn btn-primary flex-1" disabled={pending || !name.trim() || !clean} onClick={submit}>{pending ? "Adding…" : "Add to watchlist"}</button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
