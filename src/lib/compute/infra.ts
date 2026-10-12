import type { CloudSignal, CloudStrength, InfraItem, InfraResult, MicroservicesResult } from "@/db/schema";
import type { RepoInfo } from "@/lib/types";
import { isDocsRepo } from "./repos";

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

/**
 * Strength of each cloud claim, per group:
 *  strong = 3+ independent signals coming from 2+ origins (repos, or job posts)
 *  weak   = a single signal
 *  some   = in between
 */
export function computeCloudStrength(signals: CloudSignal[]): CloudStrength[] {
  const out: CloudStrength[] = [];
  const keys = [...new Set(signals.map((s) => `${s.cloud}|${s.kind}`))];
  for (const k of keys) {
    const [cloud, group] = k.split("|") as [string, "runs" | "integrates"];
    const mine = signals.filter((s) => s.cloud === cloud && s.kind === group);
    const independent = new Set(mine.map((s) => `${s.source}:${s.repo ?? "jobs"}`)).size;
    const origins = new Set(mine.map((s) => s.repo ?? "jobs")).size;
    const strength = independent >= 3 && origins >= 2 ? "strong" : independent <= 1 ? "weak" : "some";
    out.push({ cloud, group, strength, signals: independent, origins });
  }
  const rank = { strong: 0, some: 1, weak: 2 } as const;
  return out.sort((a, b) => (a.group === b.group ? rank[a.strength] - rank[b.strength] : a.group === "runs" ? -1 : 1));
}

/** Cloud named in 3+ engineering job posts counts as a "runs on" signal from jobs. */
export function addJobCloudSignals(infra: InfraResult, jobMentions: { name: string; count: number }[]): InfraResult {
  const clouds = ["AWS", "GCP", "Azure"];
  const signals = [...(infra.cloudSignals ?? [])];
  for (const m of jobMentions) {
    if (clouds.includes(m.name) && m.count >= 3 && !signals.some((s) => s.cloud === m.name && s.source === "jobs")) {
      signals.push({ cloud: m.name, kind: "runs", source: "jobs" });
    }
  }
  return finalizeClouds({ ...infra, cloudSignals: signals });
}

function finalizeClouds(infra: InfraResult): InfraResult {
  const signals = infra.cloudSignals ?? [];
  const cloudStrength = computeCloudStrength(signals);
  const clouds = [...new Set(signals.filter((s) => s.kind === "runs").map((s) => s.cloud))];
  return { ...infra, clouds, cloudStrength };
}

/** Q2, entirely in code: read file names + a few file contents, produce typed detections with permalinks. */
export function detectInfra(trees: RepoTree[], files: Files): InfraResult {
  const items: InfraItem[] = [];
  const signals: CloudSignal[] = [];

  for (const t of trees) {
    const has = (re: RegExp) => t.paths.find((p) => re.test(p));
    const link = (path: string, tool: string, category: InfraItem["category"]) =>
      add(items, { category, tool, repo: t.repo, path, url: permalink(t, path) });
    const content = (p: string) => files[`${t.repo}:${p}`] ?? "";
    const sig = (cloud: string, kind: CloudSignal["kind"], source: CloudSignal["source"], path?: string) => {
      if (!signals.some((s) => s.cloud === cloud && s.kind === kind && s.source === source && s.repo === t.repo)) {
        signals.push({ cloud, kind, source, repo: t.repo, path, url: path ? permalink(t, path) : undefined });
      }
    };
    const docs = isDocsRepo(t.repo);

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

    // IaC: a Terraform provider block means the company RUNS on that cloud
    for (const p of t.paths.filter((x) => x.endsWith(".tf")).slice(0, 3)) {
      const c = content(p);
      link(p, "Terraform", "iac");
      if (/provider\s+"aws"/.test(c)) sig("AWS", "runs", "terraform", p);
      if (/provider\s+"(google|google-beta)"/.test(c)) sig("GCP", "runs", "terraform", p);
      if (/provider\s+"azurerm"/.test(c)) sig("Azure", "runs", "terraform", p);
      if (/provider\s+"cloudflare"/.test(c)) sig("Cloudflare", "runs", "terraform", p);
    }
    const pulumi = has(/(^|\/)Pulumi\.ya?ml$/);
    if (pulumi) link(pulumi, "Pulumi", "iac");
    const cfn = has(/^(template\.(ya?ml|json)|samconfig\.toml|cloudformation[\w-]*\.(ya?ml|json))$/i);
    if (cfn) {
      link(cfn, /sam/i.test(cfn) || /AWS::Serverless/.test(content(cfn)) ? "AWS SAM" : "CloudFormation", "iac");
      if (/AWSTemplateFormatVersion|AWS::/.test(content(cfn)) || /samconfig/i.test(cfn)) sig("AWS", "runs", "serverless", cfn);
    }
    const sls = has(/(^|\/)serverless\.(ya?ml|ts)$/);
    if (sls) {
      link(sls, "Serverless Framework", "platform");
      if (/provider:\s*\n?\s*name:\s*aws|runtime:\s*(nodejs|python|go|java)/i.test(content(sls)) || !content(sls)) sig("AWS", "runs", "serverless", sls);
    }
    const cdk = has(/(^|\/)cdk\.json$/);
    if (cdk) {
      link(cdk, "AWS CDK", "iac");
      sig("AWS", "runs", "serverless", cdk);
    }

    // CI/CD: deploy steps to a cloud mean the company RUNS there
    for (const p of t.paths.filter((x) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(x)).slice(0, 4)) {
      const c = content(p);
      link(p, "GitHub Actions", "cicd");
      if (/aws-actions\//.test(c)) {
        add(items, { category: "cicd", tool: "AWS deploy actions", repo: t.repo, path: p, url: permalink(t, p) });
        sig("AWS", "runs", "ci-deploy", p);
      }
      if (/google-github-actions\//.test(c)) {
        add(items, { category: "cicd", tool: "GCP deploy actions", repo: t.repo, path: p, url: permalink(t, p) });
        sig("GCP", "runs", "ci-deploy", p);
      }
      if (/azure\/(login|webapps-deploy)/.test(c)) {
        add(items, { category: "cicd", tool: "Azure deploy actions", repo: t.repo, path: p, url: permalink(t, p) });
        sig("Azure", "runs", "ci-deploy", p);
      }
      if (/docker\/build-push-action/.test(c)) link(p, "Docker build/push", "cicd");
    }
    const cb = has(/(^|\/)cloudbuild\.ya?ml$/);
    if (cb) {
      link(cb, "Cloud Build", "cicd");
      sig("GCP", "runs", "ci-deploy", cb);
    }
    const gl = has(/(^|\/)\.gitlab-ci\.ya?ml$/);
    if (gl) link(gl, "GitLab CI", "cicd");

    // platforms. In a docs / website / examples repo these only show where docs are hosted ("integrates").
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
        if (cloud) sig(cloud, docs ? "integrates" : "runs", docs ? "docs-hosting" : "platform", p);
      }
    }

    // RPC / service mesh
    const proto = t.paths.filter((p) => p.endsWith(".proto"));
    if (proto.length) link(proto[0], "gRPC / protobuf", "rpc");
    const buf = has(/(^|\/)buf\.(yaml|gen\.yaml)$/);
    if (buf) link(buf, "Buf", "rpc");
    const mesh = has(/(^|\/)(istio|linkerd|envoy)[\w.-]*\.ya?ml$/i);
    if (mesh) link(mesh, /istio/i.test(mesh) ? "Istio" : /linkerd/i.test(mesh) ? "Linkerd" : "Envoy", "rpc");

    // cloud SDK imports: the company INTEGRATES with / supports that cloud (not proof it runs there)
    for (const p of t.paths.filter((x) => /^(package\.json|go\.mod|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle(\.kts)?)$/.test(x))) {
      const c = content(p);
      for (const rule of SDK_RULES) {
        if (rule.re.test(c)) {
          link(p, rule.tool, "sdk");
          sig(rule.cloud, "integrates", "sdk", p);
        }
      }
    }
  }

  const categories: Record<string, string[]> = {};
  for (const it of items) {
    (categories[it.category] ??= []);
    if (!categories[it.category].includes(it.tool)) categories[it.category].push(it.tool);
  }
  return finalizeClouds({ items, clouds: [], cloudSignals: signals, categories, reposScanned: trees.length });
}

/* ---------------- microservices signal ---------------- */

/**
 * Microservices signal, from deployable services (a repo with BOTH a Dockerfile and Kubernetes/Helm manifests):
 *   Strong  5+ deployable services, OR gRPC/protobuf in 5+ repos plus Kubernetes named in open roles
 *   Medium  2–4 deployable services
 *   Weak    exactly 1
 *   None    scanned, but no deployable service found
 *   Unknown nothing could be scanned
 * Docs/website/example repos never count. `reasons` is shown to the user exactly as computed.
 */
export function microservicesSignal(_repos: RepoInfo[], infra: InfraResult | null, jobK8sCount = 0): MicroservicesResult {
  if (!infra || infra.reposScanned === 0) {
    return { level: "unknown", reasons: ["No public code could be scanned, so the architecture cannot be read from code."] };
  }
  const real = (r?: string) => !!r && !isDocsRepo(r);
  const reposWith = (pred: (i: InfraItem) => boolean) => new Set(infra.items.filter((i) => real(i.repo) && pred(i)).map((i) => i.repo!));
  const docker = reposWith((i) => i.tool === "Docker");
  const orch = reposWith((i) => i.category === "orchestration");
  const deployable = [...docker].filter((r) => orch.has(r));
  const proto = reposWith((i) => i.tool === "gRPC / protobuf");

  const reasons: string[] = [];
  reasons.push(
    deployable.length
      ? `${deployable.length} deployable service repo${deployable.length === 1 ? "" : "s"} (Dockerfile + Kubernetes/Helm): ${deployable.slice(0, 5).join(", ")}${deployable.length > 5 ? "…" : ""}`
      : "No repo with both a Dockerfile and Kubernetes/Helm manifests",
  );
  if (proto.size) reasons.push(`gRPC / protobuf in ${proto.size} repo${proto.size === 1 ? "" : "s"}`);
  if (jobK8sCount > 0) reasons.push(`Kubernetes named in ${jobK8sCount} open engineering role${jobK8sCount === 1 ? "" : "s"}`);

  const strong = deployable.length >= 5 || (proto.size >= 5 && jobK8sCount >= 1);
  const level = strong ? "strong" : deployable.length >= 2 ? "medium" : deployable.length === 1 ? "weak" : "none";
  return { level, reasons };
}
