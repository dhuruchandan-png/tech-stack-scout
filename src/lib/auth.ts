import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "tss_admin";

export function adminToken(): string | null {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass) return null;
  return createHash("sha256").update(`tss:${pass}`).digest("hex");
}

export function checkPasscode(input: string): boolean {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass || !input) return false;
  const a = Buffer.from(createHash("sha256").update(input).digest());
  const b = Buffer.from(createHash("sha256").update(pass).digest());
  return timingSafeEqual(a, b);
}

/**
 * Locked by default. Every action (Server Actions and POST routes) checks the admin cookie on the server.
 * Pages stay readable without login. Only an explicit OPEN_ACCESS=true opens the actions to everyone (demo mode).
 */
export const isOpenAccess = () => process.env.OPEN_ACCESS === "true";

export async function isAdmin(): Promise<boolean> {
  if (isOpenAccess()) return true;
  const token = adminToken(); // null when ADMIN_PASSCODE is not set: nobody can unlock, so actions stay disabled
  if (!token) return false;
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === token;
}

export class NotAdminError extends Error {
  constructor() {
    super(process.env.ADMIN_PASSCODE ? "Locked. Enter the passcode (lock icon, top right) to use actions." : "Actions are disabled because ADMIN_PASSCODE is not set on the server.");
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new NotAdminError();
}

/** For route handlers that accept either the admin cookie or the cron secret. */
export async function isAdminOrCron(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true; // never matches when CRON_SECRET is unset
  return isAdmin();
}
