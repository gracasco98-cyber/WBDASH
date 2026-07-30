// admin.routes.ts — /api/auth/admin/* (user management, audit log)
// All endpoints require at least "admin" role; some require "master".
import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { hashPassword, writeAudit } from "./auth.service";
import { validatePassword, getPolicyForRole } from "./password-policy";
import { requireAuth, requireAdmin, requireMaster } from "../middleware/auth.middleware";

const router = Router();

// All admin routes require authentication first
router.use(requireAuth);

// ─── Role hierarchy helpers ───────────────────────────────────────────────────

const ROLE_RANK: Record<string, number> = { user: 1, admin: 2, master: 3 };

function canManageRole(actor: string, target: string): boolean {
  // Actor can only create/promote roles strictly below their own
  return (ROLE_RANK[actor] ?? 0) > (ROLE_RANK[target] ?? 0);
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  email:    z.string().email("Email non valida."),
  password: z.string().min(8, "Password minima 8 caratteri.").max(100),
  role:     z.enum(["user", "admin", "master"]),
  isActive: z.boolean().optional().default(true),
});

const SetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password minima 8 caratteri.").max(100),
});

const SetRoleSchema = z.object({
  role: z.enum(["user", "admin", "master"]),
});

// ─── GET /api/auth/admin/users ────────────────────────────────────────────────

router.get("/users", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, role: true, isActive: true,
      lastLoginAt: true, createdAt: true, updatedAt: true,
      createdBy: { select: { email: true } },
      failedLoginAttempts: true,
      lockedUntil: true,
      mfaEnabled: true,
      passwordChangedAt: true,
      deletedAt: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  res.json({ users });
});

// ─── POST /api/auth/admin/users ───────────────────────────────────────────────

router.post("/users", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parse = CreateUserSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Input non valido." });
    return;
  }

  const { email, password, role, isActive } = parse.data;
  const actorRole = req.user!.role;

  // Role enforcement: admin can only create users; master can create any role
  if (!canManageRole(actorRole, role)) {
    res.status(403).json({ error: `Non puoi creare utenti con ruolo "${role}".` });
    return;
  }

  // Enforce password policy for the target role
  const { valid: pwValid, errors: pwErrors } = validatePassword(password, getPolicyForRole(role));
  if (!pwValid) {
    res.status(400).json({ error: pwErrors.join(". ") + "." });
    return;
  }

  // Prevent duplicate emails
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    res.status(409).json({ error: "Email già registrata." });
    return;
  }

  const passwordHash = await hashPassword(password);

  const newUser = await prisma.user.create({
    data: {
      email:       email.toLowerCase().trim(),
      passwordHash,
      role,
      isActive,
      createdById: req.user!.id,
    },
    select: { id: true, email: true, role: true, isActive: true, createdAt: true },
  });

  await writeAudit("USER_CREATED", req.user!.id, newUser.id,
    { email: newUser.email, role, createdBy: req.user!.email }, req);

  res.status(201).json({ user: newUser });
});

// ─── PATCH /api/auth/admin/users/:id/status ───────────────────────────────────

router.patch("/users/:id/status", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { isActive } = req.body as { isActive: boolean };

  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive deve essere true o false." });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) { res.status(404).json({ error: "Utente non trovato." }); return; }

  // Self-modification guard
  if (target.id === req.user!.id) {
    res.status(400).json({ error: "Non puoi disattivarti da solo." });
    return;
  }

  // Admins cannot deactivate masters or other admins
  if (!canManageRole(req.user!.role, target.role)) {
    res.status(403).json({ error: "Permessi insufficienti per modificare questo utente." });
    return;
  }

  await prisma.user.update({ where: { id }, data: { isActive } });

  const action = isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED";
  await writeAudit(action, req.user!.id, id, { email: target.email }, req);

  res.json({ ok: true });
});

// ─── PATCH /api/auth/admin/users/:id/role ─────────────────────────────────────
// Only master can change roles.

router.patch("/users/:id/role", requireMaster, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const parse = SetRoleSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Ruolo non valido." });
    return;
  }

  const { role: newRole } = parse.data;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) { res.status(404).json({ error: "Utente non trovato." }); return; }

  if (target.id === req.user!.id) {
    res.status(400).json({ error: "Non puoi cambiare il tuo stesso ruolo." });
    return;
  }

  const oldRole = target.role;
  await prisma.user.update({ where: { id }, data: { role: newRole } });

  await writeAudit("ROLE_CHANGED", req.user!.id, id, { oldRole, newRole, email: target.email }, req);

  res.json({ ok: true });
});

// ─── POST /api/auth/admin/users/:id/reset-password ───────────────────────────

router.post("/users/:id/reset-password", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const parse = SetPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Password non valida." });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) { res.status(404).json({ error: "Utente non trovato." }); return; }

  // Admin cannot reset master's password
  if (!canManageRole(req.user!.role, target.role)) {
    res.status(403).json({ error: "Permessi insufficienti." });
    return;
  }

  const passwordHash = await hashPassword(parse.data.newPassword);
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await writeAudit("PASSWORD_RESET", req.user!.id, id, { email: target.email }, req);

  res.json({ ok: true });
});

// ─── DELETE /api/auth/admin/users/:id ─────────────────────────────────────────
// Only master can delete users (admin cannot delete other admins or masters).

router.delete("/users/:id", requireMaster, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (id === req.user!.id) {
    res.status(400).json({ error: "Non puoi eliminare il tuo stesso account." });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) { res.status(404).json({ error: "Utente non trovato." }); return; }

  // Soft-delete: mark deletedAt + deactivate to preserve audit trail
  await prisma.user.update({
    where: { id },
    data:  { isActive: false, deletedAt: new Date(), mfaEnabled: false, mfaSecret: null },
  });

  await writeAudit("USER_DELETED", req.user!.id, id, { email: target.email, softDelete: true }, req);

  res.json({ ok: true });
});

// ─── GET /api/auth/admin/audit-log ───────────────────────────────────────────

router.get("/audit-log", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 50));
  const skip  = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, action: true, details: true, ipAddress: true,
        createdAt: true,
        actor:      { select: { email: true, role: true } },
        targetUser: { select: { email: true, role: true } },
      },
    }),
    prisma.auditLog.count(),
  ]);

  res.json({ entries, total, page, limit });
});

// ─── GET /api/auth/admin/unlock/:id ──────────────────────────────────────────
// Manually unlock a locked account.

router.post("/users/:id/unlock", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) { res.status(404).json({ error: "Utente non trovato." }); return; }

  if (!canManageRole(req.user!.role, target.role)) {
    res.status(403).json({ error: "Permessi insufficienti." });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  await writeAudit("USER_UNLOCKED", req.user!.id, id, { email: target.email }, req);

  res.json({ ok: true });
});

export default router;
