import { afterEach, describe, expect, it } from "vitest";
import { cronAuthorized } from "@/lib/cron";

const req = (h?: string) => new Request("http://x/api/cron", { headers: h ? { authorization: h } : {} });

describe("cronAuthorized", () => {
  afterEach(() => { delete process.env.CRON_SECRET; });
  it("is open when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(req())).toBe(true);
  });
  it("requires the bearer secret when configured", () => {
    process.env.CRON_SECRET = "abc";
    expect(cronAuthorized(req())).toBe(false);
    expect(cronAuthorized(req("Bearer nope"))).toBe(false);
    expect(cronAuthorized(req("Bearer abc"))).toBe(true);
  });
});
