import { describe, expect, it } from "vitest";
import { detectInfra, microservicesSignal, selectFilesToFetch, type RepoTree } from "@/lib/compute/infra";
import type { InfraResult } from "@/db/schema";
import { repo } from "./helpers";

const tree = (name: string, paths: string[]): RepoTree => ({ repo: name, owner: "acme", branch: "main", paths });

describe("detectInfra (Q2, fixture repo trees)", () => {
  const paths = ["Dockerfile", "k8s/deployment.yaml", "infra/main.tf", ".github/workflows/deploy.yml", "proto/payments.proto", "package.json", "README.md"];
  const files = {
    "payments-service:infra/main.tf": 'provider "aws" {\n  region = "ap-south-1"\n}',
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

  it("reads the cloud from terraform providers, workflows and SDKs", () => expect(r.clouds).toEqual(["AWS"]));

  it("attaches repo, path and a GitHub permalink to every detection", () => {
    const tf = r.items.find((i) => i.tool === "Terraform")!;
    expect(tf.repo).toBe("payments-service");
    expect(tf.path).toBe("infra/main.tf");
    expect(tf.url).toBe("https://github.com/acme/payments-service/blob/main/infra/main.tf");
  });

  it("detects GCP and Azure from provider blocks", () => {
    const g = detectInfra([tree("x", ["main.tf"])], { "x:main.tf": 'provider "google" {}' });
    const a = detectInfra([tree("x", ["main.tf"])], { "x:main.tf": 'provider "azurerm" { features {} }' });
    expect(g.clouds).toEqual(["GCP"]);
    expect(a.clouds).toEqual(["Azure"]);
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
  const item = (tool: string, category: InfraResult["items"][number]["category"], r: string) => ({ tool, category, repo: r });
  const strongInfra: InfraResult = {
    items: ["a", "b", "c"].flatMap((r) => [item("Docker", "containers", r), item("Kubernetes", "orchestration", r)]).concat([item("gRPC / protobuf", "rpc", "a")]),
    clouds: ["AWS"], categories: {}, reposScanned: 10,
  };

  it("is strong with Dockerfile + orchestration in 3+ repos plus gRPC", () => {
    const m = microservicesSignal([repo({ name: "web" })], strongInfra);
    expect(m.level).toBe("strong");
    expect(m.reasons.join(" ")).toMatch(/3 repos have both a Dockerfile/);
  });

  it("is some with one containerised repo and a couple of service-named repos", () => {
    const infra: InfraResult = { items: [item("Docker", "containers", "a"), item("Kubernetes", "orchestration", "a")], clouds: [], categories: {}, reposScanned: 4 };
    expect(microservicesSignal([repo({ name: "auth-service" }), repo({ name: "billing-api" })], infra).level).toBe("some");
  });

  it("is none when scanned repos show no pattern, with the reason stated", () => {
    const m = microservicesSignal([repo({ name: "website" })], { items: [], clouds: [], categories: {}, reposScanned: 2 });
    expect(m.level).toBe("none");
    expect(m.reasons.length).toBeGreaterThan(0);
  });

  it("is unknown when nothing could be scanned", () => {
    expect(microservicesSignal([], null).level).toBe("unknown");
    expect(microservicesSignal([], { items: [], clouds: [], categories: {}, reposScanned: 0 }).level).toBe("unknown");
  });
});
