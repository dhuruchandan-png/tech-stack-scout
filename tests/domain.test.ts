import { describe, expect, it } from "vitest";
import { domainRoot, normalizeDomain, sameDomain } from "@/lib/domain";

describe("normalizeDomain", () => {
  it.each([
    ["https://www.Acme.com/about/", "acme.com"],
    [" HTTP://Razorpay.com?x=1 ", "razorpay.com"],
    ["foo.bar/baz", "foo.bar"],
    ["https://user@host.io:8080/x", "host.io"],
    ["WWW.Vercel.COM", "vercel.com"],
    ["sentry.io.", "sentry.io"],
  ])("cleans %s -> %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(["", "   ", "acme", "localhost", "not a domain", "http://"])("rejects %j", (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });

  it("makes duplicates collide: every messy spelling of one site normalises identically", () => {
    const set = new Set(["https://www.stripe.com/", "stripe.com", "HTTP://STRIPE.COM/pricing?x=1"].map((s) => normalizeDomain(s)));
    expect(set.size).toBe(1);
  });
});

describe("domainRoot", () => {
  it("handles plain, subdomain and multi-part TLDs", () => {
    expect(domainRoot("razorpay.com")).toBe("razorpay");
    expect(domainRoot("sub.vercel.com")).toBe("vercel");
    expect(domainRoot("app.example.co.uk")).toBe("example");
  });
});

describe("sameDomain", () => {
  it("matches the domain and its subdomains, not look-alikes", () => {
    expect(sameDomain("https://www.razorpay.com/x", "razorpay.com")).toBe(true);
    expect(sameDomain("razorpay.com", "razorpay.com")).toBe(true);
    expect(sameDomain("https://blog.razorpay.com", "razorpay.com")).toBe(true);
    expect(sameDomain("https://notrazorpay.com", "razorpay.com")).toBe(false);
    expect(sameDomain(null, "razorpay.com")).toBe(false);
  });
});
