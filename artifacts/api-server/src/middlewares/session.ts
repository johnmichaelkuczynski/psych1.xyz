import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";

const SESSION_SECRET = process.env["SESSION_SECRET"];

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

export const SESSION_COOKIE_NAME = "phil101_sid";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function sign(value: string): string {
  return crypto
    .createHmac("sha256", SESSION_SECRET as string)
    .update(value)
    .digest("base64url");
}

export function encodeSession(studentId: number): string {
  const payload = String(studentId);
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(cookie: string | undefined): number | null {
  if (!cookie) return null;
  const idx = cookie.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = cookie.slice(0, idx);
  const sig = cookie.slice(idx + 1);
  if (sign(payload) !== sig) return null;
  const id = Number(payload);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function attachSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const sid = decodeSession(req.cookies?.[SESSION_COOKIE_NAME]);
  if (sid != null) req.studentId = sid;
  next();
}

export function requireStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.studentId == null) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.studentId == null) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  // Lazy import to avoid circular deps.
  void (async () => {
    const { db, studentsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ isAdmin: studentsTable.isAdmin })
      .from(studentsTable)
      .where(eq(studentsTable.id, req.studentId as number))
      .limit(1);
    if (!rows[0]?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    next();
  })().catch((err) => {
    req.log?.error?.({ err }, "requireAdmin failed");
    res.status(500).json({ error: "Admin check failed" });
  });
}

export function setSessionCookie(res: Response, studentId: number): void {
  res.cookie(SESSION_COOKIE_NAME, encodeSession(studentId), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ONE_YEAR_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}
