"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lock, Moon, Search, Sun, Unlock } from "lucide-react";
import { toast } from "sonner";
import { lockAdmin, unlockAdmin } from "@/app/actions";
import { useRuns } from "@/components/run/RunConsole";
import { NAV, Logo } from "./Sidebar";
import { cn } from "@/lib/util";

const TITLES: Record<string, string> = { "/": "Today", "/accounts": "Watchlist", "/outreach": "Outreach", "/radar": "Radar", "/runs": "Runs", "/settings": "Settings" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme((document.documentElement.getAttribute("data-theme") as "dark" | "light") ?? "dark"), []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tss-theme", next); } catch { /* storage blocked */ }
    setTheme(next);
  };
  return (
    <button className="btn h-9 w-9 p-0" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function AdminLock({ admin, configured }: { admin: boolean; configured: boolean }) {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      const r = await unlockAdmin(pass);
      if (r.ok) { toast.success("Admin mode on. Actions are unlocked for 12 hours."); setOpen(false); setPass(""); router.refresh(); }
      else toast.error(r.error);
    });

  if (admin) {
    return (
      <button className="btn h-9 border-verified/40 text-verified" onClick={() => start(async () => { await lockAdmin(); toast("Admin mode off."); router.refresh(); })} title="Lock admin mode">
        <Unlock className="h-4 w-4" /> <span className="hidden sm:inline">Admin</span>
      </button>
    );
  }
  return (
    <div className="relative">
      <button className="btn h-9" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Unlock admin mode">
        <Lock className="h-4 w-4" /> <span className="hidden sm:inline">Admin</span>
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-50 w-72 p-4">
          <div className="label mb-2">Admin mode</div>
          <p className="mb-3 text-[12.5px] text-muted">Everything is viewable without login. Unlock to refresh, add or remove companies, approve and send.</p>
          {!configured && <p className="mb-3 text-[12px] text-change">ADMIN_PASSCODE is not set on the server.</p>}
          <input className="input" type="password" placeholder="Passcode" value={pass} autoFocus onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} aria-label="Admin passcode" />
          <button className="btn btn-primary mt-3 w-full" onClick={submit} disabled={pending || !pass}>Unlock</button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ admin, adminConfigured }: { admin: boolean; adminConfigured: boolean }) {
  const path = usePathname();
  const { refreshAll } = useRuns();
  const seg = path.split("/").filter(Boolean);
  const title = TITLES["/" + (seg[0] ?? "")] ?? "Today";
  const crumb = seg[1] ? decodeURIComponent(seg[1]) : null;

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <Link href="/" className="md:hidden" aria-label="Home"><Logo size={28} /></Link>
        <nav className="flex min-w-0 items-center gap-2 text-[14px]" aria-label="Breadcrumb">
          <Link href={"/" + (seg[0] ?? "")} className={cn(crumb ? "text-muted hover:text-ink" : "font-medium")}>{title}</Link>
          {crumb && <><span className="text-faint">/</span><span className="truncate font-medium">{crumb}</span></>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="hidden h-9 w-[300px] items-center gap-2 rounded-input border border-line-strong bg-surface px-3 text-[13px] text-faint hover:border-faint lg:flex"
            onClick={() => window.dispatchEvent(new Event("tss:palette"))}
          >
            <Search className="h-3.5 w-3.5" /> Search accounts, run commands… <span className="kbd ml-auto">⌘K</span>
          </button>
          <button className="btn h-9 w-9 p-0 lg:hidden" onClick={() => window.dispatchEvent(new Event("tss:palette"))} aria-label="Search"><Search className="h-4 w-4" /></button>
          {admin && <button className="btn hidden h-9 sm:inline-flex" onClick={refreshAll}>Refresh all</button>}
          <ThemeToggle />
          <AdminLock admin={admin} configured={adminConfigured} />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden" aria-label="Mobile">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn("flex items-center gap-1.5 rounded-input px-3 py-1.5 text-[13px] text-muted", (href === "/" ? path === "/" : path.startsWith(href)) && "bg-raised text-ink")}>
            <Icon className="h-3.5 w-3.5" />{label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
