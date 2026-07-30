"use client";
import { useState, useRef, useEffect } from "react";
import { LogOut, Users, KeyRound, ChevronDown, ShieldCheck, Shield, User as UserIcon, Settings } from "lucide-react";
import { useAuth } from "./AuthProvider";
import Link from "next/link";

function RoleIcon({ role }: { role: string }) {
  if (role === "master") return <ShieldCheck size={12} className="text-amber-400" />;
  if (role === "admin")  return <Shield size={12} className="text-blue-400" />;
  return <UserIcon size={12} className="text-zinc-500" />;
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen]  = useState(false);
  const ref              = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  const needsMfa = ["admin", "master"].includes(user.role) && !user.mfaEnabled;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-2.5 py-1.5 rounded-lg border bg-bg-card hover:border-zinc-600 transition-all ${
          needsMfa ? "border-amber-500/50" : "border-bg-border"
        }`}
      >
        <RoleIcon role={user.role} />
        {/* Email — hidden on mobile to keep header compact */}
        <span className="hidden md:inline text-xs text-zinc-300 max-w-[120px] truncate">{user.email}</span>
        {needsMfa && <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/10 px-1 rounded">MFA</span>}
        <ChevronDown size={11} className={`text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 min-w-[200px] max-w-[calc(100vw-2rem)] rounded-xl border border-bg-border bg-bg-card shadow-2xl z-50 overflow-hidden">
          {/* Identity */}
          <div className="px-3.5 py-2.5 border-b border-bg-border">
            <p className="text-xs font-medium text-white truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[10px] text-zinc-500 capitalize">{user.role}</p>
              {user.mfaEnabled
                ? <span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1 rounded">MFA attivo</span>
                : <span className="text-[9px] text-zinc-600 bg-zinc-700/30 px-1 rounded">MFA inattivo</span>
              }
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            {/* MFA warning banner for elevated roles without MFA */}
            {needsMfa && (
              <Link href="/account/security?setup_mfa=1" onClick={() => setOpen(false)}
                className="flex items-start gap-2 px-3.5 py-2 text-xs text-amber-400 bg-amber-400/5 hover:bg-amber-400/10 transition-colors border-b border-bg-border">
                <ShieldCheck size={13} className="mt-0.5 flex-shrink-0" />
                <span>MFA obbligatoria per il tuo ruolo. Configurala ora →</span>
              </Link>
            )}

            <Link href="/account/security" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-400 hover:text-white hover:bg-bg-base/60 transition-colors">
              <Settings size={13} /> Sicurezza account
            </Link>

            {(user.role === "admin" || user.role === "master") && (
              <Link href="/admin/users" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-400 hover:text-white hover:bg-bg-base/60 transition-colors">
                <Users size={13} /> Gestione utenti
              </Link>
            )}
          </div>

          {/* Logout */}
          <div className="border-t border-bg-border py-1">
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors"
            >
              <LogOut size={13} /> Disconnetti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
