"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, FileText, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { createDraft, hubspotRetry } from "@/app/actions";
import { RefreshButton } from "@/components/run/RunConsole";

export function AccountActions({ companyId, name, domain, hubspotUrl, admin, hasOpener, hubspotFailed }: {
  companyId: number; name: string; domain: string; hubspotUrl: string | null; admin: boolean; hasOpener: boolean; hubspotFailed: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <RefreshButton companyId={companyId} name={name} />
      {hubspotUrl ? (
        <a className="btn" href={hubspotUrl} target="_blank" rel="noreferrer">HubSpot <ExternalLink className="h-3.5 w-3.5" /></a>
      ) : (
        <button className="btn" disabled title="Appears after the first HubSpot sync">HubSpot <ExternalLink className="h-3.5 w-3.5" /></button>
      )}
      {hubspotFailed && (
        <button className="btn text-change" disabled={pending} onClick={() => admin ? start(async () => { const r = await hubspotRetry(companyId); r.ok ? toast.success(r.message) : toast.error(r.error); router.refresh(); }) : toast.error("Admin mode required.")}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry sync
        </button>
      )}
      <Link className="btn" href={`/accounts/${domain}/brief`}><FileText className="h-3.5 w-3.5" /> One-pager</Link>
      <button className="btn btn-primary" disabled={pending || !hasOpener} title={hasOpener ? undefined : "No opener yet"} onClick={() => admin ? start(async () => {
        const r = await createDraft(companyId);
        if (r.ok) { toast.success("Draft created."); router.push(`/outreach?draft=${r.id}`); } else toast.error(r.error);
      }) : toast.error("Admin mode required. Unlock with the lock icon (top right).")}>
        <Send className="h-3.5 w-3.5" /> Draft email
      </button>
    </div>
  );
}
