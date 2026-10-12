import { adminStatus } from "@/app/actions";
import { callTheseFirst, getAccounts, type AccountRow } from "@/lib/queries";
import { RunConsoleProvider } from "@/components/run/RunConsole";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [{ admin, configured, open }, accts] = await Promise.all([adminStatus(), getAccounts().catch(() => [] as AccountRow[])]);
  const index = accts.map((a) => ({ id: a.company.id, name: a.company.name, domain: a.company.domain }));
  const first = callTheseFirst(accts, 4).map((t) => ({
    name: t.row.company.name,
    domain: t.row.company.domain,
    languages: (t.row.snapshot?.languages ?? []).slice(0, 5).map((l) => ({ name: l.name, color: l.color, share: l.share })),
    categories: Object.keys(t.row.snapshot?.infra?.categories ?? {}),
    level: t.row.snapshot?.activity?.level ?? "dormant",
  }));
  return (
    <RunConsoleProvider admin={admin}>
      <div className="flex min-h-screen">
        <Sidebar callFirst={first} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar admin={admin} adminConfigured={configured} open={open} />
          <main className="mx-auto w-full max-w-[1440px] flex-1 overflow-x-clip px-4 pb-16 pt-0 md:px-6">{children}</main>
        </div>
        <CommandPalette companies={index} admin={admin} />
      </div>
    </RunConsoleProvider>
  );
}
