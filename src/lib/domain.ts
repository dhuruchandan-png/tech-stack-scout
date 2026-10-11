/** Normalise messy user input ("https://www.Acme.com/about/") to "acme.com". */
export function normalizeDomain(input: string): string | null {
  let s = (input ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.split(/[/?#]/)[0]; // path, query, hash
  s = s.replace(/^[^@]*@/, ""); // userinfo
  s = s.replace(/:\d+$/, ""); // port
  s = s.replace(/^www\./, "");
  s = s.replace(/\.+$/, "");
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

/** "razorpay.com" -> "razorpay"; "app.example.co.uk" -> "example" */
export function domainRoot(domain: string): string {
  const parts = domain.split(".");
  const second = new Set(["co", "com", "org", "net", "gov", "ac"]);
  if (parts.length >= 3 && second.has(parts[parts.length - 2])) return parts[parts.length - 3];
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "company";
}

/** Domain as a stable URL slug, e.g. "razorpay.com" -> "razorpay-com". */
export function domainSlug(domain: string): string {
  return domain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function sameDomain(url: string | null | undefined, domain: string): boolean {
  if (!url) return false;
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const h = hostOf(withScheme);
  return !!h && (h === domain || h.endsWith(`.${domain}`));
}
