// auth.routes.ts — /api/auth/* endpoints
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  attemptLogin, hashPassword, verifyPassword, writeAudit,
} from "./auth.service";
import { requireAuth } from "../middleware/auth.middleware";
import {
  generateTotpSecret, buildTotpUri, generateQrDataUrl, verifyTotp,
} from "./mfa.service";
import {
  listUserSessions, revokeSession, revokeAllOtherSessions, revokeAllSessions,
} from "./session.service";
import { validatePassword, getPolicyForRole, describePolicyForRole } from "./password-policy";
import { prisma, pgPool } from "../db";

const router = Router();

// ─── Trusted-device cookie (HMAC-signed, no DB required) ─────────────────────
// Format: "v1|{userId}|{expiresAt}|{nonce}|{hmac}"
// Signed with SESSION_SECRET+"_td_v1" to bind signature to user + time + nonce.
// Valid for 30 days; no per-device revocation without a DB table.

const TRUSTED_DEVICE_DAYS = 30;
const TRUSTED_COOKIE_NAME = "dash_trusted";

function tdSecret(): string {
  return (process.env.SESSION_SECRET ?? "fallback") + "_td_v1";
}

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (req.headers.cookie ?? "").split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function createTrustedCookieValue(userId: string): string {
  const expiresAt = (Date.now() + TRUSTED_DEVICE_DAYS * 86_400_000).toString();
  const nonce     = randomBytes(16).toString("hex");
  const sig       = createHmac("sha256", tdSecret())
    .update(`${userId}|${expiresAt}|${nonce}`)
    .digest("hex");
  return `v1|${userId}|${expiresAt}|${nonce}|${sig}`;
}

function verifyTrustedCookie(cookieValue: string, expectedUserId: string): boolean {
  try {
    const parts = cookieValue.split("|");
    if (parts.length !== 5 || parts[0] !== "v1") return false;
    const [, userId, expiresAtStr, nonce, sig] = parts;
    if (userId !== expectedUserId) return false;
    if (Date.now() > parseInt(expiresAtStr, 10)) return false;
    const expectedSig = createHmac("sha256", tdSecret())
      .update(`${userId}|${expiresAtStr}|${nonce}`)
      .digest("hex");
    const a = Buffer.from(sig,         "hex");
    const b = Buffer.from(expectedSig, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

function setTrustedCookie(res: Response, userId: string): void {
  res.cookie(TRUSTED_COOKIE_NAME, createTrustedCookieValue(userId), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge:   TRUSTED_DEVICE_DAYS * 86_400_000,
    path:     "/",
  });
}

// ─── Rate limiters ────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppi tentativi. Riprova tra 15 minuti." },
  skipSuccessfulRequests: true,
});

const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppi tentativi MFA. Riprova tra 15 minuti." },
});

// ─── Validation schemas ───────────────────────────────────────────────────────

const LoginSchema = z.object({
  email:    z.string().email("Email non valida."),
  password: z.string().min(1, "Password richiesta.").max(200),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword:     z.string().min(8).max(200),
});

const TotpCodeSchema = z.object({
  code: z.string().min(6).max(8),
});

// ─── Helper: extract client IP ───────────────────────────────────────────────

function clientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string | undefined)
    ?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post("/login", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Credenziali non valide." });
    return;
  }

  const { email, password } = parse.data;
  const result = await attemptLogin(email, password, req);

  if (!result.ok) {
    const message =
      result.reason === "locked"
        ? "Account temporaneamente bloccato. Riprova tra qualche minuto."
        : result.reason === "inactive"
        ? "Account disattivato. Contatta un amministratore."
        : "Email o password non corretti.";

    res.status(401).json({ error: message });
    return;
  }

  // ── MFA required: check for trusted-device cookie first ─────────────────────
  if (result.user.mfaEnabled) {
    const cookies = parseCookies(req);
    const trusted = cookies[TRUSTED_COOKIE_NAME] ?? "";

    if (trusted && verifyTrustedCookie(trusted, result.user.id)) {
      // Trusted device — skip MFA challenge, create full session immediately
      // Refresh the trusted cookie so the 30-day window rolls forward
      setTrustedCookie(res, result.user.id);
      req.session.regenerate((err) => {
        if (err) { res.status(500).json({ error: "Errore interno." }); return; }
        req.session.userId    = result.user.id;
        req.session.role      = result.user.role;
        req.session.ip        = clientIp(req);
        req.session.ua        = (req.headers["user-agent"] ?? "").slice(0, 200);
        req.session.createdAt = new Date().toISOString();
        req.session.save(async (saveErr) => {
          if (saveErr) { res.status(500).json({ error: "Errore interno." }); return; }
          await writeAudit("LOGIN_SUCCESS", result.user.id, null, { trusted_device: true }, req);
          res.json({ user: { id: result.user.id, email: result.user.email, role: result.user.role, mfaEnabled: true } });
        });
      });
      return;
    }

    // No valid trusted cookie — enter pending MFA state as usual
    req.session.regenerate((err) => {
      if (err) { res.status(500).json({ error: "Errore interno." }); return; }

      req.session.mfaPending = {
        userId:    result.user.id,
        role:      result.user.role,
        expiresAt: Date.now() + 5 * 60 * 1_000, // 5-minute window
      };

      req.session.save((saveErr) => {
        if (saveErr) { res.status(500).json({ error: "Errore interno." }); return; }
        res.json({ mfaRequired: true });
      });
    });
    return;
  }

  // ── No MFA: create full session ───────────────────────────────────────────
  req.session.regenerate((err) => {
    if (err) { res.status(500).json({ error: "Errore interno. Riprova." }); return; }

    req.session.userId    = result.user.id;
    req.session.role      = result.user.role;
    req.session.ip        = clientIp(req);
    req.session.ua        = (req.headers["user-agent"] ?? "").slice(0, 200);
    req.session.createdAt = new Date().toISOString();

    req.session.save((saveErr) => {
      if (saveErr) { res.status(500).json({ error: "Errore interno. Riprova." }); return; }
      res.json({ user: { id: result.user.id, email: result.user.email, role: result.user.role, mfaEnabled: false } });
    });
  });
});

// ─── POST /api/auth/mfa/challenge — step 2 of MFA login ──────────────────────

router.post("/mfa/challenge", mfaLimiter, async (req: Request, res: Response): Promise<void> => {
  const pending = req.session?.mfaPending;

  if (!pending || Date.now() > pending.expiresAt) {
    req.session?.destroy(() => {});
    res.status(401).json({ error: "Sessione MFA scaduta. Effettua di nuovo il login." });
    return;
  }

  const MfaChallengeSchema = z.object({
    code:           z.string().min(6).max(8),
    rememberDevice: z.boolean().optional().default(false),
  });
  const parse = MfaChallengeSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Codice non valido." });
    return;
  }
  const { rememberDevice } = parse.data;

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user?.mfaEnabled || !user.isActive) {
    res.status(401).json({ error: "Autenticazione non valida." });
    return;
  }

  // ── Check code against all registered devices (multi-device support) ──────
  const devices = await prisma.mfaDevice.findMany({ where: { userId: user.id } });

  let valid = false;
  let matchedDeviceId: string | null = null;

  if (devices.length > 0) {
    for (const d of devices) {
      if (verifyTotp(parse.data.code, d.secret)) {
        valid = true;
        matchedDeviceId = d.id;
        break;
      }
    }
  } else if (user.mfaSecret) {
    // Fallback: legacy single-device (no MfaDevice rows yet — migration pending)
    valid = verifyTotp(parse.data.code, user.mfaSecret);
  }

  if (!valid) {
    await writeAudit("MFA_FAIL", user.id, null, { reason: "bad_code" }, req);
    res.status(401).json({ error: "Codice MFA non corretto." });
    return;
  }

  // Update lastUsedAt on matched device
  if (matchedDeviceId) {
    await prisma.mfaDevice.update({ where: { id: matchedDeviceId }, data: { lastUsedAt: new Date() } })
      .catch(() => {/* non-critical */});
  }

  // ── Upgrade session to fully authenticated ────────────────────────────────
  req.session.regenerate((err) => {
    if (err) { res.status(500).json({ error: "Errore interno." }); return; }

    req.session.userId    = user.id;
    req.session.role      = user.role;
    req.session.ip        = clientIp(req);
    req.session.ua        = (req.headers["user-agent"] ?? "").slice(0, 200);
    req.session.createdAt = new Date().toISOString();

    req.session.save(async (saveErr) => {
      if (saveErr) { res.status(500).json({ error: "Errore interno." }); return; }
      await writeAudit("MFA_SUCCESS", user.id, null, { rememberDevice }, req);
      // Set trusted-device cookie so future logins on this browser skip MFA
      if (rememberDevice) setTrustedCookie(res, user.id);
      res.json({ user: { id: user.id, email: user.email, role: user.role, mfaEnabled: true } });
    });
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post("/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await writeAudit("LOGOUT", req.user!.id, null, {}, req);

  req.session.destroy((err) => {
    if (err) { res.status(500).json({ error: "Errore durante il logout." }); return; }
    res.clearCookie("dash_sid", { path: "/" });
    res.json({ ok: true });
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get("/me", requireAuth, (req: Request, res: Response): void => {
  const u = req.user!;
  res.json({ user: { id: u.id, email: u.email, role: u.role, mfaEnabled: u.mfaEnabled } });
});

// ─── POST /api/auth/change-password ──────────────────────────────────────────

router.post("/change-password", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parse = ChangePasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Input non valido." });
    return;
  }

  const { currentPassword, newPassword } = parse.data;
  const userId = req.user!.id;
  const role   = req.user!.role;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { res.status(404).json({ error: "Utente non trovato." }); return; }

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) {
    res.status(401).json({ error: "Password attuale non corretta." });
    return;
  }

  // Enforce password policy
  const { valid, errors } = validatePassword(newPassword, getPolicyForRole(role));
  if (!valid) {
    res.status(400).json({ error: errors.join(". ") + "." });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data:  { passwordHash: newHash, passwordChangedAt: new Date(), failedLoginAttempts: 0 },
  });

  await writeAudit("PASSWORD_CHANGED", userId, userId, {}, req);
  res.json({ ok: true });
});

// ─── GET /api/auth/password-policy ───────────────────────────────────────────

router.get("/password-policy", requireAuth, (req: Request, res: Response): void => {
  const rules = describePolicyForRole(req.user!.role);
  res.json({ rules, role: req.user!.role });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MFA SETUP (requires auth, but exempt from MFA-setup-required enforcement)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/auth/mfa/setup — generate secret + QR code ───────────────────

router.post("/mfa/setup", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const secret     = generateTotpSecret();
  const otpauthUri = buildTotpUri(req.user!.email, secret);
  const qrCode     = await generateQrDataUrl(otpauthUri);

  // Store pending secret in DB (not confirmed yet)
  await prisma.user.update({
    where: { id: userId },
    data:  { mfaSecretPending: secret },
  });

  res.json({ qrCode, manualCode: secret, otpauthUri });
});

// ─── POST /api/auth/mfa/setup/confirm — verify code, activate MFA ────────────

router.post("/mfa/setup/confirm", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parse = TotpCodeSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Codice non valido." });
    return;
  }

  const userId = req.user!.id;
  const user   = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.mfaSecretPending) {
    res.status(400).json({ error: "Nessun setup MFA in corso. Riavvia la procedura." });
    return;
  }

  const valid = verifyTotp(parse.data.code, user.mfaSecretPending);
  if (!valid) {
    res.status(400).json({ error: "Codice non corretto. Verifica l'ora del dispositivo e riprova." });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data:  { mfaEnabled: true, mfaSecret: user.mfaSecretPending, mfaSecretPending: null },
  });

  await writeAudit("MFA_ENABLED", userId, userId, {}, req);
  res.json({ ok: true });
});

// ─── POST /api/auth/mfa/disable — disable MFA (requires password + code) ─────

router.post("/mfa/disable", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    password: z.string().min(1),
    code:     z.string().min(6).max(8),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Richiesti password e codice MFA." });
    return;
  }

  const userId = req.user!.id;
  const user   = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { res.status(404).json({ error: "Utente non trovato." }); return; }

  if (!user.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ error: "MFA non attiva." });
    return;
  }

  const pwOk = await verifyPassword(parse.data.password, user.passwordHash);
  if (!pwOk) {
    res.status(401).json({ error: "Password non corretta." });
    return;
  }

  const codeOk = verifyTotp(parse.data.code, user.mfaSecret);
  if (!codeOk) {
    res.status(401).json({ error: "Codice MFA non corretto." });
    return;
  }

  // Block master from disabling MFA (security policy)
  if (user.role === "master") {
    res.status(403).json({ error: "Il ruolo master non può disattivare l'MFA." });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data:  { mfaEnabled: false, mfaSecret: null, mfaSecretPending: null },
  });

  await writeAudit("MFA_DISABLED", userId, userId, {}, req);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MULTI-DEVICE MFA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/auth/mfa/devices — list registered authenticators ───────────────

router.get("/mfa/devices", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  // Auto-migrate: if user has legacy single-device MFA but no MfaDevice rows, create one
  const user = await prisma.user.findUnique({ where: { id: userId } });
  let devices = await prisma.mfaDevice.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  if (user?.mfaEnabled && user.mfaSecret && devices.length === 0) {
    await prisma.mfaDevice.create({
      data: { userId, name: "Authenticator", secret: user.mfaSecret },
    });
    devices = await prisma.mfaDevice.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  }

  res.json({
    devices: devices.map(d => ({
      id:         d.id,
      name:       d.name,
      createdAt:  d.createdAt,
      lastUsedAt: d.lastUsedAt,
    })),
  });
});

// ─── POST /api/auth/mfa/devices/start — generate QR for new authenticator ────

router.post("/mfa/devices/start", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const secret     = generateTotpSecret();
  const otpauthUri = buildTotpUri(req.user!.email, secret);
  const qrCode     = await generateQrDataUrl(otpauthUri);

  // Store secret in session until user confirms
  req.session.mfaDevicePending = { secret };
  req.session.save((err) => {
    if (err) { res.status(500).json({ error: "Errore interno." }); return; }
    res.json({ qrCode, manualCode: secret, otpauthUri });
  });
});

// ─── POST /api/auth/mfa/devices/confirm — verify code and save new device ────

router.post("/mfa/devices/confirm", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    code: z.string().min(6).max(8),
    name: z.string().min(1).max(50).default("Authenticator"),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dati non validi." });
    return;
  }

  const pending = req.session.mfaDevicePending;
  if (!pending?.secret) {
    res.status(400).json({ error: "Nessun setup in corso. Riavvia la procedura." });
    return;
  }

  const valid = verifyTotp(parse.data.code, pending.secret);
  if (!valid) {
    res.status(400).json({ error: "Codice non corretto. Verifica l'ora del dispositivo e riprova." });
    return;
  }

  const userId = req.user!.id;
  const device = await prisma.mfaDevice.create({
    data: { userId, name: parse.data.name, secret: pending.secret },
  });

  // Ensure mfaEnabled = true; keep mfaSecret in sync (backward compat with legacy challenge)
  await prisma.user.update({
    where: { id: userId },
    data:  { mfaEnabled: true, mfaSecret: pending.secret, mfaSecretPending: null },
  });

  req.session.mfaDevicePending = undefined;
  req.session.save(async (err) => {
    if (err) { res.status(500).json({ error: "Errore interno." }); return; }
    await writeAudit("MFA_ENABLED", userId, userId, { deviceId: device.id, deviceName: device.name }, req);
    res.json({ ok: true, device: { id: device.id, name: device.name, createdAt: device.createdAt, lastUsedAt: null } });
  });
});

// ─── PATCH /api/auth/mfa/devices/:id — rename authenticator ──────────────────

router.patch("/mfa/devices/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ name: z.string().min(1).max(50) });
  const parse  = schema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Nome non valido (max 50 caratteri)." });
    return;
  }

  const device = await prisma.mfaDevice.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!device) {
    res.status(404).json({ error: "Autenticatore non trovato." });
    return;
  }

  await prisma.mfaDevice.update({ where: { id: device.id }, data: { name: parse.data.name } });
  res.json({ ok: true });
});

// ─── DELETE /api/auth/mfa/devices/:id — remove authenticator ─────────────────

router.delete("/mfa/devices/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ password: z.string().min(1) });
  const parse  = schema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Password richiesta per confermare la rimozione." });
    return;
  }

  const userId = req.user!.id;
  const user   = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "Utente non trovato." });
    return;
  }

  const pwOk = await verifyPassword(parse.data.password, user.passwordHash);
  if (!pwOk) {
    res.status(401).json({ error: "Password non corretta." });
    return;
  }

  const device     = await prisma.mfaDevice.findFirst({ where: { id: req.params.id, userId } });
  if (!device) {
    res.status(404).json({ error: "Autenticatore non trovato." });
    return;
  }

  const allDevices = await prisma.mfaDevice.findMany({ where: { userId } });
  const isLast     = allDevices.length <= 1;

  if (isLast && user.role === "master") {
    res.status(403).json({ error: "Il ruolo master deve mantenere almeno un autenticatore attivo." });
    return;
  }

  await prisma.mfaDevice.delete({ where: { id: device.id } });

  if (isLast) {
    // Disabling MFA entirely
    await prisma.user.update({
      where: { id: userId },
      data:  { mfaEnabled: false, mfaSecret: null, mfaSecretPending: null },
    });
  } else {
    // Keep user.mfaSecret pointing at remaining primary device (backward compat)
    const remaining = allDevices.filter(d => d.id !== device.id);
    await prisma.user.update({
      where: { id: userId },
      data:  { mfaSecret: remaining[0].secret },
    });
  }

  await writeAudit(
    isLast ? "MFA_DISABLED" : "MFA_DEVICE_REMOVED",
    userId, userId,
    { deviceId: device.id, deviceName: device.name, wasLast: isLast },
    req,
  );

  res.json({ ok: true, mfaEnabled: !isLast });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/auth/sessions — list active sessions for current user ───────────

router.get("/sessions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const currentSid = (req.session as unknown as { id: string }).id;
  const sessions   = await listUserSessions(pgPool, req.user!.id, currentSid);
  res.json({ sessions });
});

// ─── DELETE /api/auth/sessions/:sid — revoke a single session ────────────────

router.delete("/sessions/:sid", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { sid } = req.params;

  // Cannot revoke own current session this way (use /logout instead)
  const currentSid = (req.session as unknown as { id: string }).id;
  if (sid === currentSid) {
    res.status(400).json({ error: "Per chiudere la sessione corrente usa il logout." });
    return;
  }

  const deleted = await revokeSession(pgPool, sid, req.user!.id);
  if (!deleted) {
    res.status(404).json({ error: "Sessione non trovata." });
    return;
  }

  await writeAudit("SESSION_REVOKED", req.user!.id, null, { revokedSid: sid }, req);
  res.json({ ok: true });
});

// ─── DELETE /api/auth/sessions — revoke ALL other sessions ───────────────────

router.delete("/sessions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const currentSid = (req.session as unknown as { id: string }).id;
  const count      = await revokeAllOtherSessions(pgPool, req.user!.id, currentSid);

  await writeAudit("SESSION_REVOKE_ALL", req.user!.id, null, { revokedCount: count }, req);
  res.json({ ok: true, revokedCount: count });
});

export default router;
