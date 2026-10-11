import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tech Stack Scout", template: "%s · Tech Stack Scout" },
  description: "Engineering context for every account on your watchlist, refreshed weekly, with receipts.",
};

// Runs before paint so the theme never flashes.
const themeScript = `(function(){try{var t=localStorage.getItem('tss-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <Toaster position="bottom-right" theme="system" toastOptions={{ style: { background: "rgb(var(--overlay))", border: "1px solid rgb(var(--border-strong))", color: "rgb(var(--text))" } }} />
      </body>
    </html>
  );
}
