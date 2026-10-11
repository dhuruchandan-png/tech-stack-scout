"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return <button className="btn btn-primary" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print / Save PDF</button>;
}
