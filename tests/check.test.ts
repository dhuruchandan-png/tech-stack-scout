import { describe, expect, it } from "vitest";
import { checkEmail, checkOpener, checkSummary, checkTalkingPoint, citedIds, keyNouns, sanitizeGenerated, stem, stripCites, type CheckContext } from "@/lib/ai/check";

const ctx: CheckContext = {
  company: "Northwind Pay",
  validRefs: new Set(["E1", "E2", "E3"]),
  evidenceText: {
    E1: "How we cut CI from 22 to 9 minutes in our Go monorepo. Test sharding across 27 services cut median pipeline time",
    E2: "Platform Engineer role mentions Kubernetes and EKS",
    E3: "Repo payments-service Go gRPC protobuf",
  },
  factsText: "Q1 Go 46%. Q2 cloud: AWS. Tools: Helm, Terraform, gRPC, EKS. 27 service repos. 64 protobuf definitions.",
};

const GOOD = "Your post on cutting Go monorepo CI from 22 to 9 minutes stood out, and with 27 gRPC services we help teams get that speed in local dev.";

describe("checkOpener", () => {
  it("passes a specific, grounded, on-topic one-sentence opener", () => {
    const r = checkOpener(GOOD, ["E1", "E3"], ctx);
    expect(r.reasons).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("ignores citation markers the model may have left in the text", () => {
    expect(checkOpener(`${GOOD} [E1]`.replace(".", "") + ".", ["E1", "E3"], ctx).ok).toBe(true);
  });

  it("fails on a banned phrase", () => {
    const t = "I came across your Go monorepo CI post from 22 to 9 minutes and we help engineers cut build time with 27 gRPC services across teams.";
    const r = checkOpener(t, ["E1", "E3"], ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("banned phrase"))).toBe(true);
  });

  it("fails when it cites an evidence id that does not exist", () => {
    const r = checkOpener(GOOD, ["E9"], ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/does not exist: E9/);
  });

  it("fails when it cites nothing", () => {
    expect(checkOpener(GOOD, [], ctx).reasons).toContain("Cites no evidence");
  });

  it("fails on length outside 18–35 words", () => {
    const r = checkOpener("Love your Go work.", ["E1"], ctx);
    expect(r.reasons.some((x) => /must be 18–35/.test(x))).toBe(true);
    const long = Array(40).fill("word").join(" ") + ".";
    expect(checkOpener(long, ["E1"], ctx).reasons.some((x) => /must be 18–35/.test(x))).toBe(true);
  });

  it("fails when it names something that is not in the cited evidence (a made-up claim)", () => {
    const t = "Your Kafka pipeline on Snowflake slows every build, so our developer productivity tool could speed local testing for your team overall.";
    const r = checkOpener(t, ["E1"], ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("Snowflake"))).toBe(true);
  });

  it("fails a generic line that would fit any company", () => {
    const t = "We help engineering teams ship faster with a developer productivity tool that speeds up every build and test cycle for you.";
    expect(checkOpener(t, ["E1"], ctx).reasons.some((x) => x.startsWith("Names nothing specific"))).toBe(true);
  });

  it("fails on placeholders", () => {
    const t = "Hi {first_name}, your post on cutting Go monorepo CI from 22 to 9 minutes stood out, and with 27 gRPC services we help teams get faster local dev.";
    expect(checkOpener(t, ["E1", "E3"], ctx).reasons).toContain("Contains a placeholder");
  });

  it("fails when the company name is misspelled or re-cased", () => {
    const t = "Your Go monorepo CI post from 22 to 9 minutes stood out, and northwind pay running 27 gRPC services is exactly who our local dev tool helps most.";
    expect(checkOpener(t, ["E1", "E3"], ctx).reasons.some((x) => /spelled exactly/.test(x))).toBe(true);
  });

  it("does not flag the company name inside repo names, URLs or handles", () => {
    const c2 = { ...ctx, company: "Stripe", evidenceText: { ...ctx.evidenceText, E1: "stripe-go repo and stripe.com docs, Go monorepo CI from 22 to 9 minutes, 27 services" } };
    const t = "Your stripe-go repo and the Go monorepo CI from 22 to 9 minutes stood out, and with 27 gRPC services we help teams get faster local dev.";
    expect(checkOpener(t, ["E1", "E3"], c2).reasons.some((x) => /spelled exactly/.test(x))).toBe(false);
  });

  it("fails on two sentences", () => {
    const t = "Your Go monorepo CI post from 22 to 9 minutes stood out. With 27 gRPC services we help teams get that speed in local dev and testing.";
    expect(checkOpener(t, ["E1", "E3"], ctx).reasons).toContain("Opener must be one sentence");
  });

  it("fails when it does not connect to developer productivity", () => {
    const t = "Your Go monorepo post from 22 to 9 minutes stood out because 27 gRPC services across the company are genuinely impressive to read about.";
    expect(checkOpener(t, ["E1", "E3"], ctx).reasons).toContain("Does not connect to developer productivity");
  });
});

describe("checkTalkingPoint", () => {
  it("passes a grounded short point and fails a missing id", () => {
    expect(checkTalkingPoint("Three Platform Engineer roles mention Kubernetes tooling.", ["E2"], ctx).ok).toBe(true);
    expect(checkTalkingPoint("Three Platform Engineer roles mention Kubernetes tooling.", ["E7"], ctx).ok).toBe(false);
  });
  it("does not require talking points to name a specific thing (only the opener must)", () => {
    expect(checkTalkingPoint("They are hiring more infrastructure engineers this quarter.", ["E2"], ctx).reasons.some((r) => r.startsWith("Names nothing"))).toBe(false);
  });
  it("fails when it is long", () => {
    expect(checkTalkingPoint(Array(45).fill("word").join(" "), ["E1"], ctx).reasons).toContain("Talking point is longer than 40 words");
  });
});

describe("checkSummary", () => {
  const p1 = "Northwind Pay builds a Go-first platform across 27 service repos running on AWS EKS with Helm [E1][E2]. Services talk over gRPC across 64 protobuf definitions and infrastructure is managed in Terraform [E3].";
  const p2 = "The team is shipping fast with a recent post on test sharding and a Platform Engineer role that mentions Kubernetes tooling for local development [E1][E2]. Build and test speed is a live concern for them [E1].";

  it("passes when every sentence is cited with real ids and the facts are grounded", () => {
    const r = checkSummary([p1, p2], ctx);
    expect(r.reasons).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("fails when sentences carry no citations", () => {
    const bare = "Northwind Pay builds a platform across many service repos running in the cloud today. The team ships quickly every single week of the year without fail. Their stack covers several languages and a few tools overall.";
    expect(checkSummary([bare, p2], ctx).reasons.join(" ")).toMatch(/without a citation/);
  });

  it("fails on an unknown evidence id", () => {
    const bad = p1.replace("[E3]", "[E9]");
    expect(checkSummary([bad, p2], ctx).reasons.join(" ")).toMatch(/does not exist: E9/);
  });

  it("fails on a missing or too-short paragraph", () => {
    expect(checkSummary(["", p2], ctx).reasons.join(" ")).toMatch(/Paragraph 1 is missing/);
  });
});

describe("checkEmail", () => {
  const body = "Your post on cutting Go monorepo CI from 22 to 9 minutes stood out.\nWith 27 gRPC services, local dev and testing speed likely matter too.\nWould a 20-minute call next week be useful?\n\nNikhil";
  const good = { subject: "Faster Go monorepo CI at Northwind Pay", body, evidence_ids: ["E1", "E3"] };

  it("passes a short, signed, grounded email", () => expect(checkEmail(good, ctx)).toEqual({ ok: true, reasons: [] }));
  it("fails a subject over 7 words", () => expect(checkEmail({ ...good, subject: "One two three four five six seven eight nine" }, ctx).reasons).toContain("Subject is longer than 7 words"));
  it("fails a body over 110 words", () => expect(checkEmail({ ...good, body: Array(120).fill("word").join(" ") + " Nikhil" }, ctx).reasons.some((r) => /must be ≤ 110/.test(r))).toBe(true));
  it("fails without the Nikhil sign-off", () => expect(checkEmail({ ...good, body: body.replace("\n\nNikhil", "") }, ctx).reasons.some((r) => /sign-off/.test(r))).toBe(true));
  it("fails on banned phrases and missing ids", () => {
    expect(checkEmail({ ...good, body: "I hope this email finds you well. " + body }, ctx).ok).toBe(false);
    expect(checkEmail({ ...good, evidence_ids: ["E42"] }, ctx).reasons.join(" ")).toMatch(/does not exist: E42/);
  });
});

describe("helpers", () => {
  it("stripCites and citedIds", () => {
    expect(stripCites("A claim [E1][E2, E3].")).toBe("A claim.");
    expect(citedIds("x [E1] y [E2, E3] z [E1]").sort()).toEqual(["E1", "E2", "E3"]);
  });
  it("stems common suffixes", () => {
    expect(stem("services")).toBe(stem("service"));
    expect(stem("deploying")).toBe(stem("deploy"));
  });
  it("extracts key nouns and skips sentence starts, the company and stop words", () => {
    const n = keyNouns("Your Kafka pipeline at Northwind Pay moves 27 events to payments_service.", "Northwind Pay");
    expect(n).toEqual(expect.arrayContaining(["Kafka", "27", "payments_service"]));
    expect(n).not.toContain("Your");
    expect(n).not.toContain("Northwind");
  });
  it("treats ordinary hyphenated words as plain English, but capitalised compounds as claims", () => {
    const n = keyNouns("Their front-end team ships a Go-first, open-source stack.", "Acme");
    expect(n).toContain("Go-first");
    expect(n).not.toContain("front-end");
    expect(n).not.toContain("open-source");
  });
  it("sanitises the banned buzzword deterministically", () => {
    expect(sanitizeGenerated("We leverage Go and are leveraging EKS. Leverage matters.")).toBe("We use Go and are using EKS. Use matters.");
  });
});
