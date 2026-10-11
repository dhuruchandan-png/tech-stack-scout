/**
 * THE CUT, in code: Resend may only reach internal recipients. Prospects are never emailed by this app.
 * Nikhil sends to prospects from his own Gmail/Outlook.
 */

export type GuardConfig = {
  internalDomain?: string | null;
  allowlist?: string[];
  testMode?: boolean;
  testEmail?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isInternalRecipient(email: string, cfg: GuardConfig): boolean {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return false;
  const allow = (cfg.allowlist ?? []).map((a) => a.trim().toLowerCase());
  if (allow.includes(e)) return true;
  const dom = (cfg.internalDomain ?? "").trim().toLowerCase().replace(/^@/, "");
  return !!dom && e.endsWith(`@${dom}`);
}

export type GuardResult =
  | { ok: true; deliverTo: string; intendedFor: string | null }
  | { ok: false; error: string };

/** Validates a recipient and applies EMAIL_TEST_MODE routing. */
export function guardRecipient(email: string, cfg: GuardConfig): GuardResult {
  if (!isInternalRecipient(email, cfg)) {
    return {
      ok: false,
      error: `${email || "(empty)"} is not an internal address. Tech Stack Scout only emails your team (${cfg.internalDomain ? `@${cfg.internalDomain} or ` : ""}the allowlist in Settings). Prospect emails are sent from your own inbox.`,
    };
  }
  if (cfg.testMode) {
    if (!cfg.testEmail) return { ok: false, error: "EMAIL_TEST_MODE is on but TEST_EMAIL is not set." };
    return { ok: true, deliverTo: cfg.testEmail, intendedFor: email };
  }
  return { ok: true, deliverTo: email, intendedFor: null };
}

/**
 * Last line of defence, checked inside the one function that calls Resend.
 * In test mode the only deliverable address is TEST_EMAIL; otherwise it must be internal.
 */
export function canDeliver(to: string, cfg: GuardConfig): boolean {
  const t = to.trim().toLowerCase();
  if (cfg.testMode) return !!cfg.testEmail && t === cfg.testEmail.trim().toLowerCase();
  return isInternalRecipient(t, cfg);
}

export function envGuardConfig(allowlist: string[] = []): GuardConfig {
  return {
    internalDomain: process.env.INTERNAL_EMAIL_DOMAIN,
    allowlist,
    testMode: process.env.EMAIL_TEST_MODE === "true",
    testEmail: process.env.TEST_EMAIL,
  };
}

/** Mail-client handoff links. Opening these never sends anything. */
export function gmailLink(to: string, subject: string, body: string) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function outlookLink(to: string, subject: string, body: string) {
  return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function mailtoLink(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
