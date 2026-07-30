"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Users, Plus, ShieldCheck, Shield, User as UserIcon,
  RefreshCw, Lock, Unlock, Trash2, KeyRound, Eye, EyeOff,
  AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight,
  Activity,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  listUsers, createUser, setUserStatus, setUserRole, resetUserPassword,
  unlockUser, deleteUser, getAuditLog,
  type ManagedUser, type AuditEntry, type UserRole,
  canManage, ROLE_LABELS, ROLE_COLORS,
} from "@/lib/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ROLE_COLORS[role]}`}>
      {role === "master" && <ShieldCheck size={10} />}
      {role === "admin"  && <Shield size={10} />}
      {role === "user"   && <UserIcon size={10} />}
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusDot({ active, locked }: { active: boolean; locked: boolean }) {
  if (locked)  return <span className="inline-flex items-center gap-1 text-[10px] text-amber-400"><Lock size={10} /> Bloccato</span>;
  if (active)  return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 size={10} /> Attivo</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-zinc-600" /> Disattivato</span>;
}

function Toast({ msg, type }: { msg: string; type: "ok" | "err" }) {
  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium ${
      type === "ok"
        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
        : "bg-red-500/10 border-red-500/30 text-red-300"
    }`}>
      {type === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
      {msg}
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({
  actorRole,
  onClose,
  onCreated,
}: {
  actorRole: UserRole;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [role,     setRole]     = useState<UserRole>("user");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const allowedRoles: UserRole[] = actorRole === "master"
    ? ["user", "admin", "master"]
    : ["user"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: apiErr } = await createUser({ email: email.trim(), password, role });
    setLoading(false);
    if (apiErr) { setError(apiErr); return; }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-bg-border bg-bg-card p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-5">Nuovo utente</h3>

        <form onSubmit={submit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Email</label>
            <input
              type="email" required autoFocus value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/20"
              placeholder="nome@azienda.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"} required value={password}
                onChange={e => setPassword(e.target.value)} minLength={8}
                className="w-full bg-bg-base border border-bg-border rounded-lg px-3 pr-9 py-2 text-sm text-white outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/20"
                placeholder="Minimo 8 caratteri"
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Ruolo</label>
            <select
              value={role} onChange={e => setRole(e.target.value as UserRole)}
              className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent-primary/60"
            >
              {allowedRoles.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-bg-border px-4 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-all">
              {loading ? "Creazione…" : "Crea utente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

function ResetPasswordModal({
  target,
  onClose,
  onDone,
}: {
  target: ManagedUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pwd, setPwd]       = useState("");
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error: apiErr } = await resetUserPassword(target.id, pwd);
    setLoading(false);
    if (apiErr) { setError(apiErr); return; }
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-bg-border bg-bg-card p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-1">Reset password</h3>
        <p className="text-xs text-zinc-500 mb-5">{target.email}</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <input
              type={show ? "text" : "password"} required value={pwd}
              onChange={e => setPwd(e.target.value)} minLength={8} autoFocus
              className="w-full bg-bg-base border border-bg-border rounded-lg px-3 pr-9 py-2 text-sm text-white outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/20"
              placeholder="Nuova password (min. 8 caratteri)"
            />
            <button type="button" onClick={() => setShow(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-bg-border px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-all">
              {loading ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "users" | "audit";

export default function AdminUsersPage() {
  const { user: me } = useAuth();

  const [tab,           setTab]          = useState<Tab>("users");
  const [users,         setUsers]        = useState<ManagedUser[]>([]);
  const [auditEntries,  setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditTotal,    setAuditTotal]   = useState(0);
  const [auditPage,     setAuditPage]    = useState(1);
  const [loadingUsers,  setLoadingUsers] = useState(true);
  const [loadingAudit,  setLoadingAudit] = useState(false);
  const [showCreate,    setShowCreate]   = useState(false);
  const [resetTarget,   setResetTarget]  = useState<ManagedUser | null>(null);
  const [toast,         setToast]        = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data, error } = await listUsers();
    setLoadingUsers(false);
    if (error) { showToast(error, "err"); return; }
    setUsers(data!.users);
  }, [showToast]);

  const loadAudit = useCallback(async (page: number) => {
    setLoadingAudit(true);
    const { data, error } = await getAuditLog(page, 50);
    setLoadingAudit(false);
    if (error) { showToast(error, "err"); return; }
    setAuditEntries(data!.entries);
    setAuditTotal(data!.total);
    setAuditPage(page);
  }, [showToast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { if (tab === "audit") loadAudit(1); }, [tab, loadAudit]);

  if (!me || (me.role !== "admin" && me.role !== "master")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="text-center">
          <p className="text-zinc-500 text-sm">Accesso non autorizzato.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base text-white">
      {/* Header */}
      <div className="border-b border-bg-border bg-bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
              <Users size={15} className="text-accent-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">Gestione Utenti</h1>
              <p className="text-[10px] text-zinc-500">Amministrazione accessi</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">Connesso come</span>
            <RoleBadge role={me.role as UserRole} />
            <span className="text-xs text-zinc-500">{me.email}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-0">
          {(["users", "audit"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-accent-primary text-accent-primary"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "users" ? (
                <span className="flex items-center gap-1.5"><Users size={12} /> Utenti ({users.length})</span>
              ) : (
                <span className="flex items-center gap-1.5"><Activity size={12} /> Audit Log</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* ── Users tab ── */}
        {tab === "users" && (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-zinc-500">{users.length} utenti registrati</p>
              <div className="flex items-center gap-2">
                <button onClick={loadUsers}
                  className="p-2 rounded-lg border border-bg-border text-zinc-500 hover:text-white hover:border-zinc-600 transition-all">
                  <RefreshCw size={13} />
                </button>
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-primary text-white text-xs font-semibold hover:bg-accent-primary/90 transition-all">
                  <Plus size={13} /> Nuovo utente
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
              {loadingUsers ? (
                <div className="p-8 text-center text-zinc-600 text-sm">Caricamento…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-bg-border bg-bg-base/40">
                    <tr>
                      {["Email", "Ruolo", "Stato", "Ultimo accesso", "Creato", "Azioni"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border">
                    {users.map(u => {
                      const isLocked = !!(u.lockedUntil && new Date(u.lockedUntil) > new Date());
                      const isSelf   = u.id === me.id;
                      const canAct   = !isSelf && canManage(me, u.role as UserRole);

                      return (
                        <tr key={u.id} className={`hover:bg-bg-base/30 transition-colors ${!u.isActive ? "opacity-50" : ""}`}>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                            {u.email}
                            {isSelf && <span className="ml-1.5 text-[9px] text-accent-primary">(tu)</span>}
                          </td>
                          <td className="px-4 py-3"><RoleBadge role={u.role as UserRole} /></td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusDot active={u.isActive} locked={isLocked} />
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                            <span className="flex items-center gap-1"><Clock size={10} />{fmtDate(u.lastLoginAt)}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                            {fmtDate(u.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">

                              {/* Unlock */}
                              {canAct && isLocked && (
                                <button title="Sblocca account"
                                  onClick={async () => {
                                    const { error } = await unlockUser(u.id);
                                    if (error) showToast(error, "err");
                                    else { showToast("Account sbloccato."); loadUsers(); }
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-500 hover:text-amber-400 transition-all border border-transparent hover:border-amber-500/30">
                                  <Unlock size={12} />
                                </button>
                              )}

                              {/* Activate / Deactivate */}
                              {canAct && (
                                <button
                                  title={u.isActive ? "Disattiva" : "Attiva"}
                                  onClick={async () => {
                                    const { error } = await setUserStatus(u.id, !u.isActive);
                                    if (error) showToast(error, "err");
                                    else { showToast(u.isActive ? "Utente disattivato." : "Utente attivato."); loadUsers(); }
                                  }}
                                  className={`p-1.5 rounded-lg border border-transparent transition-all ${
                                    u.isActive
                                      ? "hover:bg-red-500/10 text-zinc-500 hover:text-red-400 hover:border-red-500/30"
                                      : "hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30"
                                  }`}>
                                  {u.isActive ? <Lock size={12} /> : <Unlock size={12} />}
                                </button>
                              )}

                              {/* Reset password */}
                              {canAct && (
                                <button title="Reset password"
                                  onClick={() => setResetTarget(u)}
                                  className="p-1.5 rounded-lg border border-transparent hover:bg-blue-500/10 text-zinc-500 hover:text-blue-400 hover:border-blue-500/30 transition-all">
                                  <KeyRound size={12} />
                                </button>
                              )}

                              {/* Change role (master only, except self) */}
                              {me.role === "master" && !isSelf && (
                                <select
                                  value={u.role}
                                  onChange={async (e) => {
                                    const newRole = e.target.value as UserRole;
                                    const { error } = await setUserRole(u.id, newRole);
                                    if (error) showToast(error, "err");
                                    else { showToast("Ruolo aggiornato."); loadUsers(); }
                                  }}
                                  className="bg-bg-base border border-bg-border rounded text-[10px] text-zinc-400 px-1.5 py-1 outline-none hover:border-zinc-600 transition-colors"
                                >
                                  <option value="user">Utente</option>
                                  <option value="admin">Admin</option>
                                  <option value="master">Master</option>
                                </select>
                              )}

                              {/* Delete (master only) */}
                              {me.role === "master" && !isSelf && (
                                <button title="Elimina (disattivazione permanente)"
                                  onClick={async () => {
                                    if (!confirm(`Disattivare definitivamente "${u.email}"?`)) return;
                                    const { error } = await deleteUser(u.id);
                                    if (error) showToast(error, "err");
                                    else { showToast("Utente eliminato."); loadUsers(); }
                                  }}
                                  className="p-1.5 rounded-lg border border-transparent hover:bg-red-500/10 text-zinc-600 hover:text-red-400 hover:border-red-500/30 transition-all">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── Audit Log tab ── */}
        {tab === "audit" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-zinc-500">{auditTotal} eventi registrati</p>
              <button onClick={() => loadAudit(auditPage)}
                className="p-2 rounded-lg border border-bg-border text-zinc-500 hover:text-white hover:border-zinc-600 transition-all">
                <RefreshCw size={13} />
              </button>
            </div>

            <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
              {loadingAudit ? (
                <div className="p-8 text-center text-zinc-600 text-sm">Caricamento…</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b border-bg-border bg-bg-base/40">
                    <tr>
                      {["Timestamp", "Azione", "Attore", "Target", "IP", "Dettagli"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border">
                    {auditEntries.map(e => (
                      <tr key={e.id} className="hover:bg-bg-base/20 transition-colors">
                        <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap font-mono text-[10px]">
                          {fmtDate(e.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <ActionBadge action={e.action} />
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400 font-mono">{e.actor?.email ?? "—"}</td>
                        <td className="px-4 py-2.5 text-zinc-500 font-mono">{e.targetUser?.email ?? "—"}</td>
                        <td className="px-4 py-2.5 text-zinc-700 font-mono text-[10px]">{e.ipAddress ?? "—"}</td>
                        <td className="px-4 py-2.5 text-zinc-600 max-w-[200px] truncate">
                          {e.details ? JSON.stringify(e.details) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {auditTotal > 50 && (
              <div className="flex items-center justify-end gap-2 mt-4">
                <button disabled={auditPage === 1} onClick={() => loadAudit(auditPage - 1)}
                  className="p-1.5 rounded-lg border border-bg-border text-zinc-500 hover:text-white disabled:opacity-30 transition-all">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-zinc-500">
                  Pagina {auditPage} / {Math.ceil(auditTotal / 50)}
                </span>
                <button disabled={auditPage >= Math.ceil(auditTotal / 50)} onClick={() => loadAudit(auditPage + 1)}
                  className="p-1.5 rounded-lg border border-bg-border text-zinc-500 hover:text-white disabled:opacity-30 transition-all">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateUserModal
          actorRole={me.role as UserRole}
          onClose={() => setShowCreate(false)}
          onCreated={() => { showToast("Utente creato con successo."); loadUsers(); }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => showToast("Password aggiornata.")}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    LOGIN_SUCCESS:  "text-emerald-400 bg-emerald-400/8 border-emerald-400/20",
    LOGIN_FAIL:     "text-red-400 bg-red-400/8 border-red-400/20",
    LOGOUT:         "text-zinc-400 bg-zinc-400/8 border-zinc-400/20",
    USER_CREATED:   "text-blue-400 bg-blue-400/8 border-blue-400/20",
    USER_DEACTIVATED: "text-amber-400 bg-amber-400/8 border-amber-400/20",
    USER_ACTIVATED: "text-emerald-400 bg-emerald-400/8 border-emerald-400/20",
    PASSWORD_RESET: "text-purple-400 bg-purple-400/8 border-purple-400/20",
    PASSWORD_CHANGED: "text-purple-400 bg-purple-400/8 border-purple-400/20",
    ROLE_CHANGED:   "text-orange-400 bg-orange-400/8 border-orange-400/20",
    USER_UNLOCKED:  "text-cyan-400 bg-cyan-400/8 border-cyan-400/20",
    USER_DELETED:   "text-red-400 bg-red-400/8 border-red-400/20",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-mono font-medium ${colors[action] ?? "text-zinc-500 bg-zinc-500/8 border-zinc-500/20"}`}>
      {action}
    </span>
  );
}
