// auth.middleware.ts — Express guards for authentication and authorization
import { Request, Response, NextFunction } from "express";
import { findUserById } from "../auth/auth.service";

// ─── MFA-setup enforcement ────────────────────────────────────────────────────
// Admin/master users with mfaEnabled=false are blocked on all routes EXCEPT:
//   • any /api/auth/* route (me, password-policy, change-password, mfa/setup…)
//   • /api/auth/admin/* is explicitly excluded (requires full MFA)
//   • /health
function isMfaExempt(url: string): boolean {
  const path = url.split("?")[0];
  if (path === "/health") return true;
  if (path.startsWith("/api/auth/") && !path.startsWith("/api/auth/admin/")) return true;
  return false;
}

// ─── requireAuth ──────────────────────────────────────────────────────────────
// Rejects unauthenticated requests with 401.
// Loads the user from DB on every request (session is server-side validated).
// For admin/master: also enforces that MFA is configured.

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;

  if (!userId) {
    res.status(401).json({ error: "Autenticazione richiesta." });
    return;
  }

  const user = await findUserById(userId);

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Sessione non valida." });
    return;
  }

  if (!user.isActive) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Account disattivato." });
    return;
  }

  req.user = user;

  // ── MFA enforcement for elevated roles ────────────────────────────────────
  // Admin and master users MUST have MFA configured.
  // If not, block all routes except the setup-exempt list above.
  if (["admin", "master"].includes(user.role) && !user.mfaEnabled) {
    if (!isMfaExempt(req.originalUrl)) {
      res.status(403).json({ error: "MFA_SETUP_REQUIRED" });
      return;
    }
  }

  next();
}

// ─── requireRole ─────────────────────────────────────────────────────────────
// Returns middleware that checks the user's role against an allowed list.
// Always applied AFTER requireAuth.

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: "Permessi insufficienti." });
      return;
    }
    next();
  };
}

// Convenience shortcuts
export const requireAdmin  = requireRole("admin", "master");
export const requireMaster = requireRole("master");
