/** Repo classification shared by Q1 (languages), Q2 (infra) and Q3 (activity). Pure code. */

/** docs, website, *.github.io, examples, samples, awesome-* lists: they say little about how the company builds. */
export function isDocsRepo(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /^(docs?|documentation|website|websites?|www|site|sites?|blog|examples?|samples?|demos?|playground|tutorials?)$/.test(n) ||
    /\.github\.io$/.test(n) ||
    /^awesome-/.test(n) ||
    /(^|[-_])(docs?|documentation|website|examples?|samples?)([-_]|$)/.test(n)
  );
}

/** Public SDK / client-library repos: their internal stack may differ from what the public code suggests. */
export function isSdkRepo(name: string): boolean {
  const n = name.toLowerCase();
  return /(^|[-_.])(sdk|sdks|client|clients)([-_.]|$)/.test(n) || /[-_](python|node|nodejs|go|golang|java|ruby|php|dotnet|csharp|swift|kotlin|rust|js)$/.test(n);
}

/** Commit authors that are automation, not people. */
export function isBotAuthor(login?: string | null, name?: string | null): boolean {
  const s = `${login ?? ""} ${name ?? ""}`.toLowerCase();
  return /\[bot\]|dependabot|renovate|github-actions|greenkeeper|snyk-bot|semantic-release|(^|[\s-])bot($|[\s-])|-bot\b/.test(s);
}
