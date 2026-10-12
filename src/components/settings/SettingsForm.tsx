"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { hubspotCreateProperties, saveSettings, sendTestEmail } from "@/app/actions";

type Props = {
  productNotes: string; allowlist: string[]; recipients: string[]; hubspot: boolean; testMode: boolean; internalDomain: string; testEmail: string;
  sources: { name: string; ok: boolean; detail: string }[]; crons: { path: string; when: string; cron: string }[];
};

export function SettingsForm(p: Props) {
  const [notes, setNotes] = useState(p.productNotes);
  const [allow, setAllow] = useState(p.allowlist.join("\n"));
  const [rec, setRec] = useState(p.recipients.join("\n"));
  const [testTo, setTestTo] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5 lg:col-span-2">
        <div className="label mb-1.5">Product notes · optional, feeds Gemini</div>
        <p className="mb-3 text-[12.5px] text-muted">What your product does and who it fits. Gemini uses it to explain why an account&apos;s setup matters. It never overrides evidence.</p>
        {!notes.trim() && (
          <p className="mb-2 rounded-input border border-change/40 bg-change/10 px-3 py-2 text-[12.5px] text-change" role="alert">
            Product notes are empty, so Gemini does not know what Nikhil sells and first lines will be generic. Describe the product and who it fits.
          </p>
        )}
        <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. We sell a developer productivity tool that speeds up CI and local testing for teams running microservices on Kubernetes (AWS or GCP)." />
      </section>

      <section className="card p-5">
        <div className="label mb-1.5">Internal allowlist</div>
        <p className="mb-3 text-[12.5px] text-muted">Resend can only reach {p.internalDomain ? <>addresses @{p.internalDomain} and </> : null}these addresses. One per line.</p>
        <textarea className="input mono" rows={4} value={allow} onChange={(e) => setAllow(e.target.value)} placeholder="colleague@yourcompany.com" aria-label="Internal allowlist" />
      </section>
      <section className="card p-5">
        <div className="label mb-1.5">Monday brief recipients</div>
        <p className="mb-3 text-[12.5px] text-muted">Internal addresses that get the 8:00 IST brief. Your NIKHIL_EMAIL always does.</p>
        <textarea className="input mono" rows={4} value={rec} onChange={(e) => setRec(e.target.value)} aria-label="Brief recipients" />
      </section>

      <div className="lg:col-span-2">
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await saveSettings({ productNotes: notes, internalAllowlist: lines(allow), briefRecipients: lines(rec) });
          r.ok ? toast.success("Settings saved.") : toast.error(r.error); router.refresh();
        })}>Save settings</button>
      </div>

      <section className="card p-5">
        <div className="label mb-3">Connections</div>
        <ul className="space-y-3">
          {p.sources.map((s) => (
            <li key={s.name} className="flex items-start gap-3 text-[13px]">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.ok ? "bg-verified" : "bg-alert"}`} />
              <div><div className="font-medium">{s.name} <span className="font-normal text-muted">· {s.ok ? "connected" : "not configured"}</span></div><div className="text-[12px] text-muted">{s.detail}</div></div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <button className="btn" disabled={pending || !p.hubspot} title={p.hubspot ? "" : "Set HUBSPOT_PRIVATE_APP_TOKEN first"} onClick={() => start(async () => {
            const r = await hubspotCreateProperties();
            if (!r.ok) { toast.error(r.error); return; }
            r.errors.length ? toast.error(`Some properties failed: ${r.errors[0]}`) : toast.success(`Properties ready: ${r.created.length} created, ${r.existed.length} already existed.`);
          })}>Create HubSpot properties</button>
        </div>
      </section>

      <section className="card p-5">
        <div className="label mb-3">Email · Resend (internal only)</div>
        <p className="text-[12.5px] text-muted">
          {p.testMode ? <>Test mode is <b className="text-change">on</b>: every email goes to <span className="mono">{p.testEmail || "(TEST_EMAIL not set)"}</span>.</> : <>Test mode is off. Emails go to the actual internal recipient.</>}
        </p>
        {p.testMode && !p.testEmail && (
          <p className="mt-2 rounded-input border border-alert/40 bg-alert/10 px-3 py-2 text-[12.5px] text-alert" role="alert">
            TEST_EMAIL is not set, so every email send is blocked. Set TEST_EMAIL (and NIKHIL_EMAIL) in Vercel, then redeploy.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <input className="input" placeholder="internal address" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Test email recipient" />
          <button className="btn" disabled={pending || !testTo} onClick={() => start(async () => { const r = await sendTestEmail(testTo); r.ok ? toast.success(`Test email sent to ${r.deliveredTo}.`) : toast.error(r.error); })}>Send test</button>
        </div>
        <div className="label mb-2 mt-6">Cron schedule</div>
        <ul className="space-y-1.5 text-[13px]">
          {p.crons.map((c) => <li key={c.path} className="flex items-baseline gap-2"><span className="mono text-[12px]">{c.path}</span><span className="text-muted">· {c.when}</span><span className="mono ml-auto text-[11px] text-faint">{c.cron} UTC</span></li>)}
        </ul>
      </section>
    </div>
  );
}
