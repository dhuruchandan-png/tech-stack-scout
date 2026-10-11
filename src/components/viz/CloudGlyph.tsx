/** Simple monochrome glyphs for cloud marks, drawn inline. Tinted chips, never full logos. */
const PATHS: Record<string, React.ReactNode> = {
  AWS: <path d="M3 9c3 2.2 7 2.2 10 0M11.2 8.6 13 9l-.4 1.8M5 6.5 8 3.5l3 3" />,
  GCP: <path d="M8 2.5 12.8 5.2v5.6L8 13.5l-4.8-2.7V5.2zM5.6 8h4.8" />,
  Azure: <path d="M2.5 12.5 7 3l2.2 5.2 4.3 4.3zM7 12.5l2.2-4.3" />,
  Vercel: <path d="M8 3 13.5 12.5h-11z" />,
  Cloudflare: <path d="M4.5 11.5a2.5 2.5 0 0 1 .2-5 3.6 3.6 0 0 1 6.9 1 2 2 0 0 1 .1 4z" />,
};

export function CloudGlyph({ name, size = 13 }: { name: string; size?: number }) {
  const p = PATHS[name] ?? <circle cx="8" cy="8" r="4.5" />;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}
