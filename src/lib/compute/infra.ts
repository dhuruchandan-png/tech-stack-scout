import type { InfraItem, InfraResult } from "@/db/schema";

export type RepoTree = { repo: string; branch: string; owner: string; paths: string[] };
type Files = Record<string, string>; // "repo:path" -> content

const base = (p: string) => p.split("/").pop() ?? p;
const permalink = (t: RepoTree, path: string) => `https://github.com/${t.owner}/${t.repo}/blob/${t.branch}/${path}`;

/** Which files are worth downloading to confirm a detection (capped, so we never scan whole repos). */
export function selectFilesToFetch(paths: string[]): string[] {
  const out: string[] = [];
  const tf = paths.filter((p) => p.endsWith(".tf")).slice(0, 3);
  const wf = paths.filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)).slice(0, 4);
  const manifests = paths.filter((p) =>
    /^(package\.json|go\.mod|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile)$/.test(p),
  );
  const k8s = paths
    .filter((p) => /(^|\/)(k8s|kubernetes|deploy|deployment|manifests|charts?|helm)\/.*\.ya?ml$/i.test(p))
    .filter((p) => !/Chart\.yaml$|values/i.test(base(p)))
    .slice(0, 3);
  for (const p of [...tf, ...wf, ...manifests, ...k8s]) if (!out.includes(p)) out.push(p);
  return out;
}

const SDK_RULES: { re: RegExp; cloud: string; tool: string }[] = [
  { re: /["']@aws-sdk\/|["']aws-sdk["']|\bboto3\b|github\.com\/aws\/aws-sdk-go|software\.amazon\.awssdk|com\.amazonaws/, cloud: "AWS", tool: "AWS SDK" },
  { re: /["']@google-cloud\/|\bgoogle-cloud-[a-z-]+|cloud\.google\.com\/go|com\.google\.cloud/, cloud: "GCP", tool: "Google Cloud SDK" },
  { re: /["']@azure\/|\bazure-[a-z-]+|github\.com\/Azure\/azure-sdk-for-go|com\.azure/, cloud: "Azure", tool: "Azure SDK" },
];

function add(items: InfraItem[], it: InfraItem) {
  if (!items.some((x) => x.category === it.category && x.tool === it.tool && x.repo === it.repo)) items.push(it);
}

/** Q2, entirely in code: read file names + a few file contents, produce typed detections with permalinks. */
export function detectInfra(trees: RepoTree[], files: Files): InfraResult {
  const items: InfraItem[] = [];
  const clouds = new Set<string>();

  for (const t of trees) {
    const has = (re: RegExp) => t.paths.find((p) => re.test(p));
    const link = (path: string, tool: string, category: InfraItem["category"]) =>
      add(items, { category, tool, repo: t.repo, path, url: permalink(t, path) });
    const content = (p: string) => files[`${t.repo}:${p}`] ?? "";

    // containers
    const docker = has(/(^|\/)Dockerfile(\.[\w-]+)?$/);
    if (docker) link(docker, "Docker", "containers");
    const compose = has(/(^|\/)docker-compose[\w.-]*\.ya?ml$/);
    if (compose) link(compose, "Docker Compose", "containers");

    // orchestration
    const chart = has(/(^|\/)Chart\.yaml$/);
    if (chart) link(chart, "Helm", "orchestration");
    const skaffold = has(/(^|\/)skaffold\.ya?ml$/);
    if (skaffold) link(skaffold, "Skaffold", "orchestration");
    const kustom = has(/(^|\/)kustomization\.ya?ml$/);
    if (kustom) link(kustom, "Kustomize", "orchestration");
    for (const p of t.paths.filter((x) => /\.ya?ml$/.test(x))) {
      const c = content(p);
      if (/^kind:\s*(Deployment|StatefulSet|DaemonSet|CronJob)\b/m.test(c) && /^apiVersion:/m.test(c)) {
        link(p, "Kubernetes", "orchestration");
        break;
      }
    }
    if (!items.some((i) => i.repo === t.repo && i.tool === "Kubernetes")) {
      const k8sDir = has(/(^|\/)(k8s|kubernetes)\/[^/]+\.ya?ml$/);
      if (k8sDir) link(k8sDir, "Kubernetes", "orchestration");
    }

    // IaC
    for (const p of t.paths.filter((x) => x.endsWith(".tf")).slice(0, 3)) {
      const c = content(p);
      link(p, "Terraform", "iac");
      if (/provider\s+"aws"/.test(c)) clouds.add("AWS");
      if (/provider\s+"(google|google-beta)"/.test(c)) clouds.add("GCP");
      if (/provider\s+"azurerm"/.test(c)) clouds.add("Azure");
      if (/provider\s+"cloudflare"/.test(c)) clouds.add("Cloudflare");
    }
    const pulumi = has(/(^|\/)Pulumi\.ya?ml$/);
    if (pulumi) link(pulumi, "Pulumi", "iac");
    const cfn = has(/^(template\.(ya?ml|json)|samconfig\.toml|cloudformation[\w-]*\.(ya?ml|json))$/i);
    if (cfn) {
      link(cfn, /sam/i.test(cfn) || /AWS::Serverless/.test(content(cfn)) ? "AWS SAM" : "CloudFormation", "iac");
      clouds.add("AWS");
    }
    const sls = has(/(^|\/)serverless\.(ya?ml|ts)$/);
    if (sls) {
      link(sls, "Serverless Framework", "platform");
      clouds.add("AWS");
    }
    const cdk = has(/(^|\/)cdk\.json$/);
    if (cdk) {
      link(cdk, "AWS CDK", "iac");
      clouds.add("AWS");
    }

    // CI/CD
    for (const p of t.paths.filter((x) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(x)).slice(0, 4)) {
      const c = content(p);
      link(p, "GitHub Actions", "cicd");
      if (/aws-actions\//.test(c)) {
        add(items, { category: "cicd", tool: "AWS deploy actions", repo: t.repo, path: p, url: permalink(t, p) });
        clouds.add("AWS");
      }
      if (/google-github-actions\//.test(c)) {
        add(items, { category: "cicd", tool: "GCP deploy actions", repo: t.repo, path: p, url: permalink(t, p) });
        clouds.add("GCP");
      }
      if (/azure\/(login|webapps-deploy)/.test(c)) {
        add(items, { category: "cicd", tool: "Azure deploy actions", repo: t.repo, path: p, url: permalink(t, p) });
        clouds.add("Azure");
      }
      if (/docker\/build-push-action/.test(c)) link(p, "Docker build/push", "cicd");
    }
    const cb = has(/(^|\/)cloudbuild\.ya?ml$/);
    if (cb) {
      link(cb, "Cloud Build", "cicd");
      clouds.add("GCP");
    }
    const gl = has(/(^|\/)\.gitlab-ci\.ya?ml$/);
    if (gl) link(gl, "GitLab CI", "cicd");

    // platforms
    const platforms: [RegExp, string, string?][] = [
      [/(^|\/)vercel\.json$/, "Vercel", "Vercel"],
      [/(^|\/)netlify\.toml$/, "Netlify"],
      [/(^|\/)fly\.toml$/, "Fly.io"],
      [/^app\.yaml$/, "Google App Engine", "GCP"],
      [/(^|\/)Procfile$/, "Heroku-style Procfile"],
      [/(^|\/)wrangler\.(toml|jsonc?)$/, "Cloudflare Workers", "Cloudflare"],
    ];
    for (const [re, tool, cloud] of platforms) {
      const p = has(re);
      if (p) {
        link(p, tool, "platform");
        if (cloud) clouds.add(cloud);
      }
    }

    // RPC / service mesh
    const proto = t.paths.filter((p) => p.endsWith(".proto"));
    if (proto.length) link(proto[0], "gRPC / protobuf", "rpc");
    const buf = has(/(^|\/)buf\.(yaml|gen\.yaml)$/);
    if (buf) link(buf, "Buf", "rpc");
    const mesh = has(/(^|\/)(istio|linkerd|envoy)[\w.-]*\.ya?ml$/i);
    if (mesh) link(mesh, /istio/i.test(mesh) ? "Istio" : /linkerd/i.test(mesh) ? "Linkerd" : "Envoy", "rpc");

    // cloud SDKs in manifests
    for (const p of t.paths.filter((x) => /^(package\.json|go\.mod|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle(\.kts)?)$/.test(x))) {
      const c = content(p);
      for (const rule of SDK_RULES) {
        if (rule.re.test(c)) {
          link(p, rule.tool, "sdk");
          clouds.add(rule.cloud);
        }
      }
    }
  }

  const categories: Record<string, string[]> = {};
  for (const it of items) {
    (categories[it.category] ??= []);
    if (!categories[it.category].includes(it.tool)) categories[it.category].push(it.tool);
  }
  return { items, clouds: [...clouds], categories, reposScanned: trees.length };
}

/* ---------------- microservices signal ---------------- */

import type { MicroservicesResult } from "@/db/schema";
import type { RepoInfo } from "@/lib/types";

const SERVICE_NAME = /(-service|-svc|-api|-worker|-gateway|-server|^service-|^svc-)/i;

export function microservicesSignal(repos: RepoInfo[], infra: InfraResult | null): MicroservicesResult {
  if (!infra || infra.reposScanned === 0) {
    return { level: "unknown", reasons: ["No repositories could be scanned, so the architecture cannot be read from code."] };
  }
  const reasons: string[] = [];
  let score = 0;
  const by = (tool: string) => new Set(infra.items.filter((i) => i.tool === tool).map((i) => i.repo));
  const docker = by("Docker");
  const orch = new Set(infra.items.filter((i) => i.category === "orchestration").map((i) => i.repo));
  const both = [...docker].filter((r) => orch.has(r));
  if (both.length >= 3) { score += 3; reasons.push(`${both.length} repos have both a Dockerfile and orchestration manifests`); }
  else if (both.length >= 1) { score += 1; reasons.push(`${both.length} repo(s) with a Dockerfile and orchestration manifests`); }
  else if (docker.size >= 3) { score += 1; reasons.push(`${docker.size} repos ship Dockerfiles`); }

  const protoRepos = by("gRPC / protobuf");
  if (protoRepos.size > 0) { score += 2; reasons.push(`gRPC / protobuf definitions in ${protoRepos.size} repo(s)`); }

  const composeMulti = infra.items.some((i) => i.tool === "Docker Compose");
  if (composeMulti) { score += 1; reasons.push("docker-compose present (multi-container local setup)"); }

  if (infra.items.some((i) => ["Istio", "Linkerd", "Envoy"].includes(i.tool))) { score += 2; reasons.push("service mesh config detected"); }

  const active = repos.filter((r) => !r.isFork && !r.isArchived);
  const svcNamed = active.filter((r) => SERVICE_NAME.test(r.name));
  if (svcNamed.length >= 5) { score += 2; reasons.push(`${svcNamed.length} service-style repo names (*-service, *-api, *-worker…)`); }
  else if (svcNamed.length >= 2) { score += 1; reasons.push(`${svcNamed.length} service-style repo names`); }

  const level = score >= 5 ? "strong" : score >= 2 ? "some" : "none";
  if (level === "none") reasons.push("No container, orchestration or RPC pattern found in the scanned repos.");
  return { level, reasons };
}
