"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, ListChecks, Mail, Radar as RadarIcon, Settings } from "lucide-react";
import { Fingerprint } from "@/components/viz/Fingerprint";
import { cn } from "@/lib/util";

export const NAV = [
  { href: "/", label: "Today", icon: CalendarDays, keys: "G T" },
  { href: "/accounts", label: "Watchlist", icon: ListChecks, keys: "G W" },
  { href: "/outreach", label: "Outreach", icon: Mail, keys: "G O" },
  { href: "/radar", label: "Radar", icon: RadarIcon, keys: "G R" },
  { href: "/runs", label: "Runs", icon: Activity, keys: "G U" },
  { href: "/settings", label: "Settings", icon: Settings, keys: "" },
];

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r="11" stroke="rgb(var(--signal))" strokeWidth="2.4" />
      <path d="M17 17 L24 11" stroke="rgb(var(--signal))" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11.5 12.5a8.5 8.5 0 0 1 8-3.8" stroke="rgb(var(--signal))" strokeOpacity=".5" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="17" r="1.8" fill="rgb(var(--signal))" />
      <path d="M25.5 25.5 L34 34" stroke="rgb(var(--signal))" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type First = { name: string; domain: string; languages: { name: string; color: string; share: number }[]; categories: string[]; level: string };

export function Sidebar({ callFirst }: { callFirst: First[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-line bg-surface md:flex lg:w-[236px]">
      <Link href="/" className="flex items-center gap-3 px-4 py-5 lg:px-5" aria-label="Tech Stack Scout home">
        <Logo />
        <div className="hidden lg:block">
          <div className="text-[15px] font-semibold leading-tight">Tech Stack Scout</div>
          <div className="label !text-[10px]">Account recon</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-0.5 px-2 lg:px-3" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon, keys }) => (
          <Link
            key={href} href={href} title={label}
            className={cn(
              "flex h-9 items-center gap-3 rounded-input px-3 text-[13.5px] text-muted transition hover:bg-raised hover:text-ink",
              active(href) && "bg-raised text-ink shadow-[inset_2px_0_0_rgb(var(--signal))]",
            )}
            aria-current={active(href) ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden flex-1 lg:inline">{label}</span>
            {keys && <span className="kbd hidden lg:inline">{keys}</span>}
          </Link>
        ))}
      </nav>

      {callFirst.length > 0 && (
        <div className="mt-6 hidden px-3 lg:block">
          <div className="label mb-2 px-3">Call these first</div>
          <div className="flex flex-col gap-0.5">
            {callFirst.map((a) => (
              <Link key={a.domain} href={`/accounts/${a.domain}`} className="flex h-9 items-center gap-3 rounded-input px-3 text-[13.5px] text-muted hover:bg-raised hover:text-ink">
                <Fingerprint languages={a.languages} categories={a.categories} level={a.level} size={22} />
                <span className="truncate">{a.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
