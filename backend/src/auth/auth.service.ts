// auth.service.ts — core auth helpers
import bcrypt from "bcryptjs";
import { Request } from "express";
import { prisma } from "../db";

// ─── Constants (overridable via env) ─────────────────────────────────────────

const BCRYPT_ROUNDS       = 12;
const MAX_FAILED_ATTEMPTS = parseInt(process.env.LOCKOUT_ATTEMPTS    ?? "5");
const LOCKOUT_MINUTES     = parseInt(process.env.LOCKOUT_MINUTES     ?? "15");

// Progressive response delay: [0ms, 0ms, 0ms, 2s, 5s, 10s] for attempts 1,2,3,4,5,6+
// This slows down automated attacks without a full lockout on the first attempts.
const PROGRESSIVE_DELAY_MS = [0, 0, 0, 2_000, 5_000, 10_000];

// ─── Password helpers ─────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── User lookup ──────────────────────────────────────────────────────────────

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where:  { id },
    select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true, mfaEnabled: true },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
}

// ─── Login logic ──────────────────────────────────────────────────────────────

type LoginResult =
  | { ok: true;  user: { id: string; email: string; role: string; mfaEnabled: boolean } }
  | { ok: false; reason: "not_found" | "inactive" | "locked" | "bad_password" };

export async function attemptLogin(
  email:    string,
  password: string,
  req:      Request
): Promise<LoginResult> {
  const raw = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!raw) {
    // Burn time to prevent user enumeration via timing
    await bcrypt.compare(password, "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await writeAudit("LOGIN_FAIL", null, null, { email, reason: "not_found" }, req);
    return { ok: false, reason: "not_found" };
  }

  if (!raw.isActive) {
    await writeAudit("LOGIN_FAIL", raw.id, null, { reason: "inactive" }, req);
    return { ok: false, reason: "inactive" };
  }

  // Check lockout
  if (raw.lockedUntil && raw.lockedUntil > new Date()) {
    await writeAudit("LOGIN_FAIL", raw.id, null, { reason: "locked", lockedUntil: raw.lockedUntil }, req);
    return { ok: false, reason: "locked" };
  }

  // Progressive delay based on prior failed attempts (anti-brute-force without full lockout)
  const delayIdx = Math.min(raw.failedLoginAttempts, PROGRESSIVE_DELAY_MS.length - 1);
  const delayMs  = PROGRESSIVE_DELAY_MS[delayIdx];
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  const match = await verifyPassword(password, raw.passwordHash);

  if (!match) {
    const newFails   = raw.failedLoginAttempts + 1;
    const shouldLock = newFails >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: raw.id },
      data:  {
        failedLoginAttempts: newFails,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1_000)
          : undefined,
      },
    });

    await writeAudit("LOGIN_FAIL", raw.id, null,
      { reason: "bad_password", attempt: newFails, locked: shouldLock }, req);

    return { ok: false, reason: "bad_password" };
  }

  // ── Successful password auth — reset counters ──────────────────────────────
  await prisma.user.update({
    where: { id: raw.id },
    data:  { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await writeAudit("LOGIN_SUCCESS", raw.id, null, { mfaEnabled: raw.mfaEnabled }, req);

  return { ok: true, user: { id: raw.id, email: raw.email, role: raw.role, mfaEnabled: raw.mfaEnabled } };
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export async function writeAudit(
  action:       string,
  actorId:      string | null,
  targetUserId: string | null,
  details:      Record<string, unknown>,
  req:          Request
): Promise<void> {
  try {
    const ip = (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
    const ua = (req.headers["user-agent"] as string | undefined) ?? "";

    await prisma.auditLog.create({
      data: {
        action,
        actorId:      actorId      ?? undefined,
        targetUserId: targetUserId ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details:      details as any,
        ipAddress:    ip,
        userAgent:    ua.slice(0, 512),
      },
    });
  } catch (err) {
    // Audit write failure must never crash the app
    console.error("[Audit] Failed to write audit log:", err);
  }
}
