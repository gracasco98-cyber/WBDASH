// lib/auth.ts — typed client for all auth + user-management endpoints
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "master" | "admin" | "user";

export interface AuthUser {
  id:         string;
  email:      string;
  role:       UserRole;
  mfaEnabled: boolean;
}

export interface ManagedUser {
  id:                  string;
  email:               string;
  role:                UserRole;
  isActive:            boolean;
  mfaEnabled:          boolean;
  lastLoginAt:         string | null;
  passwordChangedAt:   string | null;
  createdAt:           string;
  updatedAt:           string;
  failedLoginAttempts: number;
  lockedUntil:         string | null;
  deletedAt:           string | null;
  createdBy:           { email: string } | null;
}

export interface AuditEntry {
  id:         string;
  action:     string;
  details:    Record<string, unknown> | null;
  ipAddress:  string | null;
  createdAt:  string;
  actor:      { email: string; role: string } | null;
  targetUser: { email: string; role: string } | null;
}

export interface SessionInfo {
  sid:       string;
  ip:        string | null;
  ua:        string | null;
  createdAt: string | null;
  expiresAt: string;
  isCurrent: boolean;
}

export interface MfaDevice {
  id:         string;
  name:       string;
  createdAt:  string;
  lastUsedAt: string | null;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function authFetch<T>(
  path: string,
  opts: RequestInit = {}
): Promise<{ data?: T; error?: string; status?: number }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    });

    const body = await res.json().catch(() => ({}));

    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
      return { error: "Unauthenticated", status: 401 };
    }

    if (res.status === 403 && body?.error === "MFA_SETUP_REQUIRED" && typeof window !== "undefined" && !window.location.pathname.startsWith("/account/security")) {
      window.location.href = "/account/security?setup_mfa=1";
      return { error: "MFA_SETUP_REQUIRED", status: 403 };
    }

    if (!res.ok) {
      return { error: body?.error ?? `HTTP ${res.status}`, status: res.status };
    }
    return { data: body as T, status: res.status };
  } catch {
    return { error: "Errore di rete. Controlla la connessione." };
  }
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  return authFetch<{ user?: AuthUser; mfaRequired?: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function mfaChallenge(code: string, rememberDevice = false) {
  return authFetch<{ user: AuthUser }>("/api/auth/mfa/challenge", {
    method: "POST",
    body: JSON.stringify({ code, rememberDevice }),
  });
}

export async function logout() {
  return authFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function getMe() {
  return authFetch<{ user: AuthUser }>("/api/auth/me");
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return authFetch<{ ok: boolean }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function getPasswordPolicy() {
  return authFetch<{ rules: string[]; role: string }>("/api/auth/password-policy");
}

// ─── MFA setup ────────────────────────────────────────────────────────────────

export async function mfaSetupStart() {
  return authFetch<{ qrCode: string; manualCode: string; otpauthUri: string }>("/api/auth/mfa/setup", {
    method: "POST",
  });
}

export async function mfaSetupConfirm(code: string) {
  return authFetch<{ ok: boolean }>("/api/auth/mfa/setup/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function mfaDisable(password: string, code: string) {
  return authFetch<{ ok: boolean }>("/api/auth/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}

// ─── Multi-device MFA ─────────────────────────────────────────────────────────

export async function listMfaDevices() {
  return authFetch<{ devices: MfaDevice[] }>("/api/auth/mfa/devices");
}

export async function mfaDeviceStart() {
  return authFetch<{ qrCode: string; manualCode: string; otpauthUri: string }>(
    "/api/auth/mfa/devices/start",
    { method: "POST" },
  );
}

export async function mfaDeviceConfirm(code: string, name: string) {
  return authFetch<{ ok: boolean; device: MfaDevice }>(
    "/api/auth/mfa/devices/confirm",
    { method: "POST", body: JSON.stringify({ code, name }) },
  );
}

export async function renameMfaDevice(id: string, name: string) {
  return authFetch<{ ok: boolean }>(
    `/api/auth/mfa/devices/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
}

export async function deleteMfaDevice(id: string, password: string) {
  return authFetch<{ ok: boolean; mfaEnabled: boolean }>(
    `/api/auth/mfa/devices/${encodeURIComponent(id)}`,
    { method: "DELETE", body: JSON.stringify({ password }) },
  );
}

// ─── Session management ───────────────────────────────────────────────────────

export async function listSessions() {
  return authFetch<{ sessions: SessionInfo[] }>("/api/auth/sessions");
}

export async function revokeSession(sid: string) {
  return authFetch<{ ok: boolean }>(`/api/auth/sessions/${encodeURIComponent(sid)}`, {
    method: "DELETE",
  });
}

export async function revokeAllOtherSessions() {
  return authFetch<{ ok: boolean; revokedCount: number }>("/api/auth/sessions", {
    method: "DELETE",
  });
}

// ─── Admin — user management ──────────────────────────────────────────────────

export async function listUsers() {
  return authFetch<{ users: ManagedUser[] }>("/api/auth/admin/users");
}

export async function createUser(payload: {
  email: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
}) {
  return authFetch<{ user: ManagedUser }>("/api/auth/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function setUserStatus(id: string, isActive: boolean) {
  return authFetch<{ ok: boolean }>(`/api/auth/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function setUserRole(id: string, role: UserRole) {
  return authFetch<{ ok: boolean }>(`/api/auth/admin/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function resetUserPassword(id: string, newPassword: string) {
  return authFetch<{ ok: boolean }>(`/api/auth/admin/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export async function unlockUser(id: string) {
  return authFetch<{ ok: boolean }>(`/api/auth/admin/users/${id}/unlock`, {
    method: "POST",
  });
}

export async function deleteUser(id: string) {
  return authFetch<{ ok: boolean }>(`/api/auth/admin/users/${id}`, {
    method: "DELETE",
  });
}

export async function getAuditLog(page = 1, limit = 50) {
  return authFetch<{ entries: AuditEntry[]; total: number; page: number; limit: number }>(
    `/api/auth/admin/audit-log?page=${page}&limit=${limit}`
  );
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

export const ROLE_RANK: Record<UserRole, number> = { user: 1, admin: 2, master: 3 };

export function canManage(actor: AuthUser, targetRole: UserRole): boolean {
  return ROLE_RANK[actor.role] > ROLE_RANK[targetRole];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  master: "Master",
  admin:  "Admin",
  user:   "Utente",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  master: "text-amber-400  bg-amber-400/10  border-amber-400/30",
  admin:  "text-blue-400   bg-blue-400/10   border-blue-400/30",
  user:   "text-zinc-400   bg-zinc-400/10   border-zinc-400/30",
};
