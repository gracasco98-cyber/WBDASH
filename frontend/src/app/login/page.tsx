"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { login, mfaChallenge, getMe } from "@/lib/auth";

function LogoMark() {
  return (
    <div className="flex items-center justify-center gap-2.5 mb-8">
      <div className="w-9 h-9 rounded-xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-accent-primary" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </div>
      <div>
        <div className="text-sm font-semibold text-white leading-none">My Dashboard</div>
        <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-widest">Sales Dashboard</div>
      </div>
    </div>
  );
}

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const returnTo     = searchParams.get("from") ?? "/";
  const emailRef     = useRef<HTMLInputElement>(null);
  const codeRef      = useRef<HTMLInputElement>(null);

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [checking, setChecking] = useState(true);

  // ── MFA step ───────────────────────────────────────────────────────────────
  const [mfaRequired,    setMfaRequired]    = useState(false);
  const [mfaCode,        setMfaCode]        = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);

  // If already authenticated, redirect immediately
  useEffect(() => {
    getMe().then(({ data }) => {
      if (data?.user) router.replace(returnTo);
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, [returnTo, router]);

  useEffect(() => {
    if (!checking && !mfaRequired) emailRef.current?.focus();
    if (mfaRequired)               codeRef.current?.focus();
  }, [checking, mfaRequired]);

  // ── Step 1: password submit ────────────────────────────────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const { data, error: apiError } = await login(email.trim(), password);

      if (apiError || !data) {
        setError(apiError ?? "Errore sconosciuto.");
        setPassword("");
        return;
      }

      if (data.mfaRequired) {
        setMfaRequired(true);
        return;
      }

      if (data.user) {
        router.replace(returnTo);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: MFA code submit ────────────────────────────────────────────────
  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const { data, error: apiError } = await mfaChallenge(mfaCode.trim(), rememberDevice);

      if (apiError || !data?.user) {
        setError(apiError ?? "Codice non corretto.");
        setMfaCode("");
        return;
      }

      router.replace(returnTo);
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <Loader2 size={28} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-[380px]">
        <LogoMark />

        <div className="rounded-2xl border border-bg-border bg-bg-card p-8 shadow-2xl shadow-black/40">

          {/* ── MFA step ── */}
          {mfaRequired ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={18} className="text-accent-primary" />
                <h1 className="text-lg font-semibold text-white">Verifica in due passaggi</h1>
              </div>
              <p className="text-sm text-zinc-500 mb-6">
                Inserisci il codice a 6 cifre dall&apos;app autenticatore.
              </p>

              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={e => { setMfaCode(e.target.value.replace(/\D/g, "")); setError(null); }}
                  placeholder="000000"
                  className="w-full bg-bg-base border border-bg-border rounded-lg px-4 py-3 text-2xl text-white text-center tracking-[0.5em] placeholder-zinc-700 outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/20 transition-all"
                />

                {/* Remember device checkbox */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={e => setRememberDevice(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-4 h-4 rounded border border-bg-border bg-bg-base peer-checked:bg-accent-primary peer-checked:border-accent-primary transition-colors flex items-center justify-center">
                      {rememberDevice && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
                    Non chiedere di nuovo su questo dispositivo per 30 giorni
                  </span>
                </label>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3.5 py-2.5">
                    <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-300">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Verifica in corso…</> : "Verifica"}
                </button>

                <button type="button" onClick={() => { setMfaRequired(false); setMfaCode(""); setError(null); }}
                  className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1">
                  ← Torna al login
                </button>
              </form>
            </>
          ) : (
            /* ── Password step ── */
            <>
              <h1 className="text-lg font-semibold text-white mb-1">Accedi al gestionale</h1>
              <p className="text-sm text-zinc-500 mb-7">Accesso riservato agli utenti autorizzati.</p>

              <form onSubmit={handlePasswordSubmit} autoComplete="on" noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Email</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                    <input
                      ref={emailRef}
                      type="email"
                      name="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError(null); }}
                      required
                      placeholder="nome@azienda.com"
                      className="w-full bg-bg-base border border-bg-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/20 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                    <input
                      type={showPwd ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(null); }}
                      required
                      placeholder="••••••••"
                      className="w-full bg-bg-base border border-bg-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/20 transition-all"
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                      aria-label={showPwd ? "Nascondi password" : "Mostra password"}>
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3.5 py-2.5">
                    <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full flex items-center justify-center gap-2 mt-2 rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-accent-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Accesso in corso…</> : "Accedi"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-700">
          Accesso non autorizzato è vietato e tracciato.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <Loader2 size={28} className="text-zinc-600 animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
