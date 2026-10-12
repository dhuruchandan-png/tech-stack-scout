import { describe, expect, it } from "vitest";
import { addJobCloudSignals, computeCloudStrength, detectInfra, microservicesSignal, selectFilesToFetch, type RepoTree } from "@/lib/compute/infra";
import type { InfraItem, InfraResult } from "@/db/schema";

const tree = (name: string, paths: string[]): RepoTree => ({ repo: name, owner: "acme", branch: "main", paths });
const TF_AWS = 'provider "aws" {\n  region = "ap-south-1"\n}';

describe("detectInfra (Q2, fixture repo trees)", () => {
  const paths = ["Dockerfile", "k8s/deployment.yaml", "infra/main.tf", ".github/workflows/deploy.yml", "proto/payments.proto", "package.json", "README.md"];
  const files = {
    "payments-service:infra/main.tf": TF_AWS,
    "payments-service:.github/workflows/deploy.yml": "steps:\n  - uses: aws-actions/configure-aws-credentials@v4\n  - uses: docker/build-push-action@v5",
    "payments-service:k8s/deployment.yaml": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments",
    "payments-service:package.json": '{"dependencies":{"@aws-sdk/client-s3":"^3.0.0"}}',
  };
  const r = detectInfra([tree("payments-service", paths)], files);

  it("finds each category purely from file names and contents", () => {
    expect(r.categories.containers).toContain("Docker");
    expect(r.categories.orchestration).toContain("Kubernetes");
    expect(r.categories.iac).toContain("Terraform");
    expect(r.categories.cicd).toEqual(expect.arrayContaining(["GitHub Actions", "AWS deploy actions", "Docker build/push"]));
    expect(r.categories.rpc).toContain("gRPC / protobuf");
    expect(r.categories.sdk).toContain("AWS SDK");
  });

  it("'runs on' comes from Terraform providers and CI deploy steps, not from SDK imports", () => {
    expect(r.clouds).toEqual(["AWS"]);
    const sources = (r.cloudSignals ?? []).filter((s) => s.kind === "runs").map((s) => s.source).sort();
    expect(sources).toEqual(["ci-deploy", "terraform"]);
  });

  it("an SDK import is only 'integrates', with weak strength", () => {
    expect(r.cloudStrength).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cloud: "AWS", group: "runs", strength: "some", signals: 2 }),
        expect.objectContaining({ cloud: "AWS", group: "integrates", strength: "weak", signals: 1 }),
      ]),
    );
  });

  it("attaches repo, path and a GitHub permalink to every detection", () => {
    const tf = r.items.find((i) => i.tool === "Terraform")!;
    expect(tf.repo).toBe("payments-service");
    expect(tf.path).toBe("infra/main.tf");
    expect(tf.url).toBe("https://github.com/acme/payments-service/blob/main/infra/main.tf");
  });

  it("detects GCP and Azure from provider blocks", () => {
    expect(detectInfra([tree("x", ["main.tf"])], { "x:main.tf": 'provider "google" {}' }).clouds).toEqual(["GCP"]);
    expect(detectInfra([tree("x", ["main.tf"])], { "x:main.tf": 'provider "azurerm" { features {} }' }).clouds).toEqual(["Azure"]);
  });

  it("SDK imports alone never put a cloud in 'runs on' (the Temporal / go.mod case)", () => {
    const e = detectInfra([tree("s2s-proxy", ["go.mod"])], { "s2s-proxy:go.mod": "require cloud.google.com/go/storage v1.0.0\nrequire github.com/aws/aws-sdk-go v1.0.0" });
    expect(e.clouds).toEqual([]);
    expect(e.cloudStrength?.filter((c) => c.group === "integrates").map((c) => c.cloud).sort()).toEqual(["AWS", "GCP"]);
  });

  it("vercel.json in a docs/website repo is docs hosting ('integrates'); in a real repo it means they run there", () => {
    const docs = detectInfra([tree("docs", ["vercel.json"])], {});
    expect(docs.clouds).toEqual([]);
    expect(docs.cloudSignals?.[0]).toMatchObject({ cloud: "Vercel", kind: "integrates", source: "docs-hosting" });
    const app = detectInfra([tree("web-app", ["vercel.json"])], {});
    expect(app.clouds).toEqual(["Vercel"]);
  });

  it("returns nothing for a repo with no infra files", () => {
    const e = detectInfra([tree("website", ["index.html", "src/app.js"])], {});
    expect(e.items).toEqual([]);
    expect(e.clouds).toEqual([]);
    expect(e.reposScanned).toBe(1);
  });

  it("does not call a yaml file Kubernetes unless it has kind: Deployment", () => {
    const e = detectInfra([tree("x", ["config/app.yaml"])], { "x:config/app.yaml": "name: foo\nkind: Config" });
    expect(e.categories.orchestration).toBeUndefined();
  });
});

describe("cloud strength", () => {
  const sig = (cloud: string, source: "terraform" | "ci-deploy" | "serverless" | "platform" | "jobs", repo?: string) => ({ cloud, kind: "runs" as const, source, repo });

  it("Strong = 3+ independent signals from 2+ repos or jobs", () => {
    const s = computeCloudStrength([sig("AWS", "terraform", "a"), sig("AWS", "ci-deploy", "a"), sig("AWS", "terraform", "b")]);
    expect(s[0]).toMatchObject({ cloud: "AWS", group: "runs", strength: "strong", signals: 3, origins: 2 });
  });
  it("three signals from ONE repo are not strong", () => {
    const s = computeCloudStrength([sig("AWS", "terraform", "a"), sig("AWS", "ci-deploy", "a"), sig("AWS", "serverless", "a")]);
    expect(s[0].strength).toBe("some");
  });
  it("Weak = a single signal", () => {
    expect(computeCloudStrength([sig("GCP", "terraform", "a")])[0].strength).toBe("weak");
  });
  it("a cloud named in 3+ job posts is a 'runs' signal from jobs", () => {
    const base: InfraResult = { items: [], clouds: [], categories: {}, reposScanned: 0 };
    const out = addJobCloudSignals(base, [{ name: "AWS", count: 3 }, { name: "GCP", count: 2 }, { name: "Kubernetes", count: 9 }]);
    expect(out.clouds).toEqual(["AWS"]);
    expect(out.cloudSignals?.[0]).toMatchObject({ cloud: "AWS", kind: "runs", source: "jobs" });
    expect(out.cloudStrength?.[0]).toMatchObject({ cloud: "AWS", strength: "weak" });
  });
});

describe("selectFilesToFetch", () => {
  it("caps terraform files at 3 and picks workflows, manifests and k8s manifests", () => {
    const p = ["a.tf", "b.tf", "c.tf", "d.tf", "e.tf", ".github/workflows/ci.yml", "go.mod", "k8s/svc.yaml", "k8s/values.yaml", "src/main.go"];
    const out = selectFilesToFetch(p);
    expect(out.filter((x) => x.endsWith(".tf"))).toHaveLength(3);
    expect(out).toEqual(expect.arrayContaining([".github/workflows/ci.yml", "go.mod", "k8s/svc.yaml"]));
    expect(out).not.toContain("src/main.go");
    expect(out).not.toContain("k8s/values.yaml");
  });
});

describe("microservicesSignal", () => {
  const item = (tool: string, category: InfraItem["category"], repo: string): InfraItem => ({ tool, category, repo });
  const deployable = (names: string[]) => names.flatMap((r) => [item("Docker", "containers", r), item("Kubernetes", "orchestration", r)]);
  const infraOf = (items: InfraItem[]): InfraResult => ({ items, clouds: [], categories: {}, reposScanned: 12 });
  const names = (n: number) => Array.from({ length: n }, (_, i) => `svc-${i + 1}`);

  it("Strong = 5+ deployable services (Dockerfile + Kubernetes/Helm in the same repo)", () => {
    const m = microservicesSignal([], infraOf(deployable(names(5))));
    expect(m.level).toBe("strong");
    expect(m.reasons[0]).toBe("5 deployable service repos (Dockerfile + Kubernetes/Helm): svc-1, svc-2, svc-3, svc-4, svc-5");
  });
  it("Strong = gRPC in 5+ repos plus Kubernetes named in open roles", () => {
    const protos = names(5).map((r) => item("gRPC / protobuf", "rpc", r));
    expect(microservicesSignal([], infraOf(protos), 3).level).toBe("strong");
    expect(microservicesSignal([], infraOf(protos), 0).level).toBe("none");
  });
  it("Medium = 2-4 deployable services; Weak = exactly 1; None = scanned but none found", () => {
    expect(microservicesSignal([], infraOf(deployable(names(4)))).level).toBe("medium");
    expect(microservicesSignal([], infraOf(deployable(names(2)))).level).toBe("medium");
    expect(microservicesSignal([], infraOf(deployable(names(1)))).level).toBe("weak");
    expect(microservicesSignal([], infraOf([])).level).toBe("none");
  });
  it("a Dockerfile without orchestration is not a deployable service", () => {
    expect(microservicesSignal([], infraOf([item("Docker", "containers", "a"), item("Docker", "containers", "b"), item("Docker", "containers", "c")])).level).toBe("none");
  });
  it("docs and example repos never count (Temporal: 2 repos was 'Strong' before)", () => {
    expect(microservicesSignal([], infraOf(deployable(["docs", "examples", "real-svc"]))).level).toBe("weak");
  });
  it("shows the reasons it computed, including gRPC and Kubernetes-in-roles", () => {
    const m = microservicesSignal([], infraOf([...deployable(names(2)), item("gRPC / protobuf", "rpc", "svc-1")]), 4);
    expect(m.reasons).toEqual([
      "2 deployable service repos (Dockerfile + Kubernetes/Helm): svc-1, svc-2",
      "gRPC / protobuf in 1 repo",
      "Kubernetes named in 4 open engineering roles",
    ]);
  });
  it("Unknown when nothing could be scanned", () => {
    expect(microservicesSignal([], null).level).toBe("unknown");
    expect(microservicesSignal([], { items: [], clouds: [], categories: {}, reposScanned: 0 }).level).toBe("unknown");
  });
});
