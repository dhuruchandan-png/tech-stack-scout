"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-xl p-8">
      <AlertTriangle className="mb-3 h-6 w-6 text-change" />
      <h2 className="serif text-[26px]">Something went wrong on this page.</h2>
      <p className="mt-2 text-[13px] text-muted">The rest of the app is unaffected. Try again, and if it keeps happening check the Runs page and your environment variables.</p>
      <pre className="mono mt-4 overflow-x-auto rounded-input border border-line bg-bg p-3 text-[12px] text-change">{error.message}</pre>
      <button className="btn btn-primary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
