"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Activity, CalendarDays, Clock, ListChecks, Mail, Moon, Plus, Radar as RadarIcon, RefreshCw, Search, Settings, Lock } from "lucide-react";
import { useRuns } from "@/components/run/RunConsole";

type C = { id: number; name: string; domain: string };
const RECENT_KEY = "tss-recent";

function recent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
export function rememberAccount(domain: string) {
  try {
    const next = [domain, ...recent().filter((d) => d !== domain)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage blocked */ }
}

export function CommandPalette({ companies, admin }: { companies: C[]; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const router = useRouter();
  const { refreshAll, refresh } = useRuns();

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  useEffect(() => {
    let chord: number | null = null;
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (chord && Date.now() - chord < 900) {
        const map: Record<string, string> = { t: "/", w: "/accounts", o: "/outreach", r: "/radar", u: "/runs" };
        if (map[k]) { e.preventDefault(); router.push(map[k]); }
        chord = null;
        return;
      }
      if (k === "g") chord = Date.now();
    };
    const onOpen = () => { setRecents(recent()); setOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("tss:palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("tss:palette", onOpen); };
  }, [router]);

  useEffect(() => { if (open) setRecents(recent()); }, [open]);

  const recentCos = recents.map((d) => companies.find((c) => c.domain === d)).filter((c): c is C => !!c);
  const item = "flex cursor-pointer items-center gap-3 rounded-input px-3 py-2 text-[13.5px] text-muted aria-selected:bg-raised aria-selected:text-ink";

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command palette" className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[14vh]" >
      <div className="card w-full max-w-xl overflow-hidden !bg-overlay">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-faint" />
          <Command.Input placeholder="Jump to an account or run a command…" className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
          <span className="kbd">esc</span>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">Nothing matches. Try an account name.</Command.Empty>
          {recentCos.length > 0 && (
            <Command.Group heading={<span className="label px-3">Recently viewed</span>}>
              {recentCos.map((c) => (
                <Command.Item key={`r-${c.domain}`} value={`recent ${c.name} ${c.domain}`} className={item} onSelect={() => go(`/accounts/${c.domain}`)}>
                  <Clock className="h-4 w-4" /> {c.name} <span className="mono ml-auto text-[11px] text-faint">{c.domain}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading={<span className="label px-3">Go to</span>}>
            <Command.Item value="today" className={item} onSelect={() => go("/")}><CalendarDays className="h-4 w-4" /> Today<span className="kbd ml-auto">G T</span></Command.Item>
            <Command.Item value="watchlist accounts" className={item} onSelect={() => go("/accounts")}><ListChecks className="h-4 w-4" /> Watchlist<span className="kbd ml-auto">G W</span></Command.Item>
            <Command.Item value="outreach drafts" className={item} onSelect={() => go("/outreach")}><Mail className="h-4 w-4" /> Outreach<span className="kbd ml-auto">G O</span></Command.Item>
            <Command.Item value="radar" className={item} onSelect={() => go("/radar")}><RadarIcon className="h-4 w-4" /> Radar<span className="kbd ml-auto">G R</span></Command.Item>
            <Command.Item value="runs" className={item} onSelect={() => go("/runs")}><Activity className="h-4 w-4" /> Runs<span className="kbd ml-auto">G U</span></Command.Item>
            <Command.Item value="settings" className={item} onSelect={() => go("/settings")}><Settings className="h-4 w-4" /> Settings</Command.Item>
          </Command.Group>
          <Command.Group heading={<span className="label px-3">Actions</span>}>
            <Command.Item value="add company" className={item} onSelect={() => go("/accounts?add=1")}><Plus className="h-4 w-4" /> Add company</Command.Item>
            <Command.Item value="refresh all" className={item} onSelect={() => { setOpen(false); refreshAll(); }}><RefreshCw className="h-4 w-4" /> Refresh all{!admin && <span className="ml-auto text-[11px] text-faint">admin</span>}</Command.Item>
            <Command.Item value="toggle theme dark light" className={item} onSelect={() => {
              const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
              document.documentElement.setAttribute("data-theme", next);
              try { localStorage.setItem("tss-theme", next); } catch { /* blocked */ }
              setOpen(false);
            }}><Moon className="h-4 w-4" /> Toggle theme</Command.Item>
            <Command.Item value="admin mode unlock" className={item} onSelect={() => setOpen(false)}><Lock className="h-4 w-4" /> Admin mode: use the lock icon, top right</Command.Item>
          </Command.Group>
          <Command.Group heading={<span className="label px-3">Accounts</span>}>
            {companies.map((c) => (
              <Command.Item key={c.domain} value={`${c.name} ${c.domain}`} className={item} onSelect={() => go(`/accounts/${c.domain}`)}>
                <span className="truncate">{c.name}</span>
                <span className="mono ml-auto text-[11px] text-faint">{c.domain}</span>
                {admin && (
                  <button className="kbd hover:text-signal" onClick={(e) => { e.stopPropagation(); setOpen(false); refresh(c.id, c.name); }} aria-label={`Refresh ${c.name}`}>refresh</button>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
