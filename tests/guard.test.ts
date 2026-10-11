import { describe, expect, it } from "vitest";
import { canDeliver, gmailLink, guardRecipient, isInternalRecipient, mailtoLink, outlookLink } from "@/lib/email/guard";

const cfg = { internalDomain: "corp.com", allowlist: ["boss@partner.io"], testMode: false, testEmail: null };

describe("internal allowlist guard", () => {
  it("allows the internal domain and explicit allowlist addresses, case-insensitively", () => {
    expect(isInternalRecipient("a@corp.com", cfg)).toBe(true);
    expect(isInternalRecipient("A@CORP.com", cfg)).toBe(true);
    expect(isInternalRecipient("boss@partner.io", cfg)).toBe(true);
    expect(isInternalRecipient("a@corp.com", { ...cfg, internalDomain: "@corp.com" })).toBe(true);
  });

  it("rejects prospects, look-alike domains and malformed input", () => {
    expect(isInternalRecipient("cto@prospect.com", cfg)).toBe(false);
    expect(isInternalRecipient("a@notcorp.com", cfg)).toBe(false);
    expect(isInternalRecipient("a@corp.com.evil.io", cfg)).toBe(false);
    expect(isInternalRecipient("not-an-email", cfg)).toBe(false);
    expect(isInternalRecipient("", cfg)).toBe(false);
  });

  it("rejects everything when no domain or allowlist is configured", () => {
    expect(isInternalRecipient("a@corp.com", { internalDomain: "", allowlist: [] })).toBe(false);
  });
});

describe("guardRecipient", () => {
  it("blocks a prospect with a clear explanation", () => {
    const r = guardRecipient("cto@prospect.com", cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not an internal address/);
  });
  it("delivers to the internal address when test mode is off", () => {
    expect(guardRecipient("a@corp.com", cfg)).toEqual({ ok: true, deliverTo: "a@corp.com", intendedFor: null });
  });
  it("routes everything to TEST_EMAIL in test mode and remembers the intended recipient", () => {
    expect(guardRecipient("a@corp.com", { ...cfg, testMode: true, testEmail: "me@gmail.com" })).toEqual({ ok: true, deliverTo: "me@gmail.com", intendedFor: "a@corp.com" });
  });
  it("still blocks prospects in test mode", () => {
    expect(guardRecipient("cto@prospect.com", { ...cfg, testMode: true, testEmail: "me@gmail.com" }).ok).toBe(false);
  });
  it("fails loudly when test mode is on but TEST_EMAIL is missing", () => {
    expect(guardRecipient("a@corp.com", { ...cfg, testMode: true, testEmail: null }).ok).toBe(false);
  });
});

describe("canDeliver: the last line of defence inside the Resend call", () => {
  it("never delivers to a prospect, with test mode on or off", () => {
    expect(canDeliver("cto@prospect.com", cfg)).toBe(false);
    expect(canDeliver("cto@prospect.com", { ...cfg, testMode: true, testEmail: "me@gmail.com" })).toBe(false);
  });
  it("in test mode only TEST_EMAIL is deliverable", () => {
    const t = { ...cfg, testMode: true, testEmail: "me@gmail.com" };
    expect(canDeliver("me@gmail.com", t)).toBe(true);
    expect(canDeliver("a@corp.com", t)).toBe(false);
  });
  it("outside test mode internal addresses are deliverable", () => expect(canDeliver("a@corp.com", cfg)).toBe(true));
});

describe("mail client links (opening them never sends anything)", () => {
  it("url-encodes subject and body", () => {
    const g = gmailLink("a@b.com", "Hi & bye", "Line 1\nLine 2");
    expect(g).toContain("https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.com&su=Hi%20%26%20bye&body=Line%201%0ALine%202");
    expect(outlookLink("a@b.com", "S", "B")).toContain("https://outlook.office.com/mail/deeplink/compose?to=a%40b.com&subject=S&body=B");
    expect(mailtoLink("a@b.com", "S", "B")).toMatch(/^mailto:/);
  });
});
