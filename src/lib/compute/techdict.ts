/** Curated tech dictionary used (in code) to tag job descriptions and blog posts. */
export const TECH_TERMS: { name: string; re: RegExp; group: "language" | "cloud" | "infra" | "data" | "practice" }[] = [
  // Capitalised "Go" only: the lowercase verb "go" must never count as the language.
  { name: "Go", re: /\b(Golang|golang)\b|\bGo (developers?|engineers?|services?|monorepo|codebase)\b|\bwritten in Go\b|\bGo\b(?=[,/ ]+(and|or|Python|Java|Rust|Kubernetes|TypeScript))/, group: "language" },
  { name: "TypeScript", re: /\btypescript\b/i, group: "language" },
  { name: "Python", re: /\bpython\b/i, group: "language" },
  { name: "Java", re: /\bjava\b(?!script)/i, group: "language" },
  { name: "Kotlin", re: /\bkotlin\b/i, group: "language" },
  { name: "Rust", re: /\brust\b/i, group: "language" },
  { name: "Ruby", re: /\b(ruby|rails)\b/i, group: "language" },
  { name: "Node.js", re: /\bnode\.?js\b/i, group: "language" },
  { name: "React", re: /\breact(\.js)?\b/i, group: "language" },
  { name: "Scala", re: /\bscala\b/i, group: "language" },
  { name: "AWS", re: /\b(aws|amazon web services|eks|ecs|lambda|s3|ec2)\b/i, group: "cloud" },
  { name: "GCP", re: /\b(gcp|google cloud|gke|bigquery)\b/i, group: "cloud" },
  { name: "Azure", re: /\b(azure|aks)\b/i, group: "cloud" },
  { name: "Kubernetes", re: /\b(kubernetes|k8s|helm|kustomize)\b/i, group: "infra" },
  { name: "Docker", re: /\bdocker\b/i, group: "infra" },
  { name: "Terraform", re: /\b(terraform|pulumi|infrastructure as code|iac)\b/i, group: "infra" },
  { name: "gRPC", re: /\b(grpc|protobuf|protocol buffers)\b/i, group: "infra" },
  { name: "Microservices", re: /\bmicroservices?\b/i, group: "infra" },
  { name: "CI/CD", re: /\b(ci\/cd|continuous (integration|delivery|deployment)|github actions|jenkins|circleci|buildkite)\b/i, group: "infra" },
  { name: "Kafka", re: /\bkafka\b/i, group: "data" },
  { name: "Postgres", re: /\bpostgres(ql)?\b/i, group: "data" },
  { name: "Redis", re: /\bredis\b/i, group: "data" },
  { name: "MongoDB", re: /\bmongo(db)?\b/i, group: "data" },
  { name: "Elasticsearch", re: /\b(elasticsearch|opensearch)\b/i, group: "data" },
  { name: "Observability", re: /\b(observability|prometheus|grafana|opentelemetry|datadog)\b/i, group: "infra" },
  { name: "Developer productivity", re: /\b(developer (productivity|experience|tooling|platform)|platform engineering|internal developer|dev ?ex|build (speed|times?)|ci (times?|speed))\b/i, group: "practice" },
];

/** Q2 add-on: which cloud / infra tools do the open engineering roles name, and how many roles name each? */
export function summarizeJobTech(texts: string[]): { name: string; count: number }[] {
  const keep = new Set(TECH_TERMS.filter((t) => t.group === "cloud" || t.group === "infra").map((t) => t.name));
  const counts = new Map<string, number>();
  for (const t of texts) for (const name of findTech(t)) if (keep.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

export function findTech(text: string): string[] {
  const found: string[] = [];
  for (const t of TECH_TERMS) if (t.re.test(text) && !found.includes(t.name)) found.push(t.name);
  return found;
}

/** ~25-word snippet centred on the first match of any term. */
export function snippetAround(text: string, terms: string[], words = 25): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const toks = clean.split(" ");
  let hit = -1;
  for (const term of terms) {
    const def = TECH_TERMS.find((t) => t.name === term);
    if (!def) continue;
    const idx = toks.findIndex((w) => def.re.test(w) || w.toLowerCase().includes(term.toLowerCase()));
    if (idx >= 0) { hit = idx; break; }
  }
  const start = Math.max(0, (hit < 0 ? 0 : hit) - Math.floor(words / 3));
  const slice = toks.slice(start, start + words).join(" ");
  return `${start > 0 ? "…" : ""}${slice}${start + words < toks.length ? "…" : ""}`;
}

/**
 * Engineering roles, by TITLE only. Developer-relations, success, sales, support and similar "developer" titles
 * are not engineers, so they are rejected before the positive match.
 */
const NOT_ENGINEERING = /\b(success|advocate|advocacy|evangelist|relations|sales|solutions?|sales engineer|support|customer|recruit(er|ing)?|talent|account|marketing|community|content|writer|designer|partner(ship)?s?|operations manager|program manager|product manager|people|hr|finance|legal|counsel|executive assistant|professional services|solutions? architect|solutions? engineer(ing)?)\b/i;
const ENGINEERING_TITLE_RE = /\b(engineer|engineering|developer|sre|site reliability|devops|platform|infrastructure|architect|data scientist|machine learning|ml |security engineer|application security|appsec|firmware|programmer)\b/i;

export function isEngineeringRole(title: string): boolean {
  if (NOT_ENGINEERING.test(title)) return false;
  return ENGINEERING_TITLE_RE.test(title);
}

// kept for callers that import the old names
export const ENGINEERING_TITLE = ENGINEERING_TITLE_RE;
export const ENGINEERING_DEPT = /\b(engineering|technology|platform|infrastructure|devops|sre)\b/i;
