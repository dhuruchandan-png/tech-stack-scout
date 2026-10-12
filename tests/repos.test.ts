import { describe, expect, it } from "vitest";
import { isBotAuthor, isDocsRepo, isSdkRepo } from "@/lib/compute/repos";

describe("isDocsRepo", () => {
  it.each(["docs", "website", "acme.github.io", "examples", "samples", "awesome-go", "acme-docs", "temporal-examples"])("%s is a docs/example repo", (n) => expect(isDocsRepo(n)).toBe(true));
  it.each(["payments-service", "temporal", "sdk-go", "api", "cli"])("%s is a real repo", (n) => expect(isDocsRepo(n)).toBe(false));
});

describe("isSdkRepo", () => {
  it.each(["stripe-python", "stripe-node", "stripe-go", "temporal-sdk-go", "acme-client", "acme-java", "sdk-core"])("%s is an SDK/client library", (n) => expect(isSdkRepo(n)).toBe(true));
  it.each(["payments-service", "link-cli", "billing", "console"])("%s is not", (n) => expect(isSdkRepo(n)).toBe(false));
});

describe("isBotAuthor", () => {
  it.each([["dependabot[bot]", null], ["renovate", "Renovate Bot"], ["github-actions[bot]", null], [null, "release-bot"], ["snyk-bot", null]])("%s / %s is a bot", (login, name) => expect(isBotAuthor(login as string | null, name as string | null)).toBe(true));
  it.each([["alice", "Alice Smith"], ["robotics-fan", "Robin"], [null, null]])("%s / %s is a person", (login, name) => expect(isBotAuthor(login as string | null, name as string | null)).toBe(false));
});
