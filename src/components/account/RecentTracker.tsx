"use client";

import { useEffect } from "react";
import { rememberAccount } from "@/components/shell/CommandPalette";

/** Remembers recently viewed accounts for the ⌘K palette (per browser). */
export function RecentTracker({ domain }: { domain: string }) {
  useEffect(() => rememberAccount(domain), [domain]);
  return null;
}
