/**
 * Scheduled endpoints (Vercel Cron). If CRON_SECRET is set, the request must carry it (Vercel sends it automatically);
 * if it is not set, the call is allowed. The app itself has no login: every page and action is open.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}
