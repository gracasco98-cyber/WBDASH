"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShieldCheck, Shield, KeyRound, Smartphone, Laptop, Monitor,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Eye, EyeOff, Trash2, LogOut,
  Plus, Pencil, QrCode,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import {
  changePassword,
  listMfaDevices, mfaDeviceStart, mfaDeviceConfirm, renameMfaDevice, deleteMfaDevice,
  listSessions, revokeSession, revokeAllOtherSessions, getPasswordPolicy,
  type SessionInfo, type MfaDevice,
} from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

function uaIcon(ua: string | null) {
  if (!ua) return <Monitor size={14} className="text-zinc-600" />;
  const s = ua.toLowerCase();
  if (/mobile|android|iphone/.test(s)) return <Smartphone size={14} className="text-zinc-500" />;
  if (/tablet|ipad/.test(s))           return <Laptop size={14} className="text-zinc-500" />;
  return <Monitor size={14} className="text-zinc-500" />;
}

function uaLabel(ua: string | null) {
  if (!ua) return "Dispositivo sconosciuto";
  // Extract browser + OS hint
  const browser =
    /edg/i.test(ua)     ? "Edge" :
    /chrome/i.test(ua)  ? "Chrome" :
    /firefox/i.test(ua) ? "Firefox" :
    /safari/i.test(ua)  ? "Safari" : "Browser";
  const os =
    /windows/i.test(ua) ? "Windows" :
    /mac os/i.test(ua)  ? "macOS" :
    /linux/i.test(ua)   ? "Linux" :
    /android/i.test(ua) ? "Android" :
    /ios|iphone|ipad/i.test(ua) ? "iOS" : "";
  return `${browser}${os ? " su " + os : ""}`;
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Section({ title, icon, children }: {
  title: string;
  icon:  React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-bg-border bg-bg-card p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: "ok" | "err" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-2xl text-sm ${
      type === "ok"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : "border-red-500/30 bg-red-500/10 text-red-300"
    }`}>
      {type === "ok" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
      {msg}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PASSWORD SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function PasswordSection({ onToast }: { onToast: (msg: string, t: "ok" | "err") => void }) {
  const [cur,    setCur]    = useState("");
  const [next,   setNext]   = useState("");
  const [showC,  setShowC]  = useState(false);
  const [showN,  setShowN]  = useState(false);
  const [loading,setLoading]= useState(false);
  const [rules,  setRules]  = useState<string[]>([]);

  useEffect(() => {
    getPasswordPolicy().then(({ data }) => { if (data) setRules(data.rules); });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await changePassword(cur, next);
    setLoading(false);
    if (error) { onToast(error, "err"); return; }
    onToast("Password aggiornata con successo.", "ok");
    setCur(""); setNext("");
  }

  return (
    <Section title="Password" icon={<KeyRound size={16} />}>
      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <input
            type={showC ? "text" : "password"}
            placeholder="Password attuale"
            value={cur}
            onChange={e => setCur(e.target.value)}
            required
            className="w-full bg-bg-base border border-bg-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-accent-primary/60 transition-all"
          />
          <button type="button" onClick={() => setShowC(v => !v)} tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
            {showC ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <div className="relative">
          <input
            type={showN ? "text" : "password"}
            placeholder="Nuova password"
            value={next}
            onChange={e => setNext(e.target.value)}
            required
            className="w-full bg-bg-base border border-bg-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-accent-primary/60 transition-all"
          />
          <button type="button" onClick={() => setShowN(v => !v)} tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
            {showN ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {rules.length > 0 && (
          <ul className="space-y-0.5">
            {rules.map(r => (
              <li key={r} className="text-[11px] text-zinc-600 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" /> {r}
              </li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={loading || !cur || !next}
          className="w-full rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-all"
        >
          {loading ? "Aggiornamento…" : "Cambia password"}
        </button>
      </form>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MFA SECTION — multi-device authenticator management
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Inline-rename row ────────────────────────────────────────────────────────

function DeviceRow({
  device, isMaster, isLast,
  onRenamed, onDeleted,
  onToast,
}: {
  device:    MfaDevice;
  isMaster:  boolean;
  isLast:    boolean;
  onRenamed: (id: string, name: string) => void;
  onDeleted: (id: string, mfaEnabled: boolean) => void;
  onToast:   (msg: string, t: "ok" | "err") => void;
}) {
  const [renaming,    setRenaming]    = useState(false);
  const [renameVal,   setRenameVal]   = useState(device.name);
  const [delConfirm,  setDelConfirm]  = useState(false);
  const [delPwd,      setDelPwd]      = useState("");
  const [showDelPwd,  setShowDelPwd]  = useState(false);
  const [busy,        setBusy]        = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  function fmtShort(d: string | null) {
    if (!d) return "Mai";
    return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
  }

  async function saveRename() {
    const trimmed = renameVal.trim();
    if (!trimmed || trimmed === device.name) { setRenaming(false); setRenameVal(device.name); return; }
    setBusy(true);
    const { error } = await renameMfaDevice(device.id, trimmed);
    setBusy(false);
    if (error) { onToast(error, "err"); return; }
    onRenamed(device.id, trimmed);
    setRenaming(false);
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!delPwd) return;
    setBusy(true);
    const { data, error } = await deleteMfaDevice(device.id, delPwd);
    setBusy(false);
    if (error) { onToast(error, "err"); return; }
    onToast(isLast ? "MFA disattivata." : "Autenticatore rimosso.", "ok");
    onDeleted(device.id, data?.mfaEnabled ?? false);
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-base overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="w-7 h-7 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center flex-shrink-0">
          <Smartphone size={13} className="text-accent-primary" />
        </div>

        <div className="flex-1 min-w-0">
          {renaming ? (
            <input
              ref={renameRef}
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={saveRename}
              onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") { setRenaming(false); setRenameVal(device.name); } }}
              maxLength={50}
              className="w-full bg-bg-card border border-accent-primary/40 rounded-md px-2 py-0.5 text-xs text-white outline-none focus:border-accent-primary/70"
              autoFocus
            />
          ) : (
            <p className="text-xs font-medium text-white truncate">{device.name}</p>
          )}
          <p className="text-[10px] text-zinc-600">
            Aggiunto: {fmtShort(device.createdAt)} · Usato: {fmtShort(device.lastUsedAt)}
          </p>
        </div>

        {/* Rename button */}
        {!renaming && !delConfirm && (
          <button
            onClick={() => { setRenaming(true); setTimeout(() => renameRef.current?.select(), 10); }}
            className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded"
            title="Rinomina"
          >
            <Pencil size={12} />
          </button>
        )}

        {/* Delete button */}
        {!delConfirm && !(isMaster && isLast) && (
          <button
            onClick={() => { setDelConfirm(true); setRenaming(false); }}
            className="text-zinc-600 hover:text-red-400 transition-colors p-1 rounded"
            title="Rimuovi autenticatore"
          >
            <Trash2 size={12} />
          </button>
        )}

        {/* Master lock badge on last device */}
        {isMaster && isLast && (
          <span className="text-[10px] text-amber-500/70 flex-shrink-0" title="Il ruolo master deve mantenere almeno un autenticatore">
            🔒
          </span>
        )}
      </div>

      {/* Delete confirm panel */}
      {delConfirm && (
        <form onSubmit={handleDelete} className="px-3 pb-3 pt-1 border-t border-bg-border space-y-2">
          <p className="text-[11px] text-zinc-400">
            {isLast
              ? "Rimuovendo l'ultimo autenticatore, l'MFA verrà disattivata. Inserisci la tua password per confermare."
              : "Inserisci la tua password per confermare la rimozione."
            }
          </p>
          <div className="relative">
            <input
              type={showDelPwd ? "text" : "password"}
              placeholder="Password"
              value={delPwd}
              onChange={e => setDelPwd(e.target.value)}
              required
              autoFocus
              className="w-full bg-bg-card border border-bg-border rounded-lg pl-3 pr-9 py-2 text-xs text-white placeholder-zinc-700 outline-none focus:border-red-500/50 transition-all"
            />
            <button type="button" onClick={() => setShowDelPwd(v => !v)} tabIndex={-1}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              {showDelPwd ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => { setDelConfirm(false); setDelPwd(""); }}
              className="flex-1 rounded-lg border border-bg-border px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
              Annulla
            </button>
            <button type="submit"
              disabled={busy || !delPwd}
              className="flex-1 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              {isLast ? "Disattiva MFA" : "Rimuovi"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Add device flow ──────────────────────────────────────────────────────────

function AddDeviceFlow({
  onAdded, onCancel, onToast,
}: {
  onAdded:  (device: MfaDevice) => void;
  onCancel: () => void;
  onToast:  (msg: string, t: "ok" | "err") => void;
}) {
  const [step,    setStep]    = useState<"name" | "qr" | "code">("name");
  const [name,    setName]    = useState("");
  const [qrCode,  setQrCode]  = useState("");
  const [manual,  setManual]  = useState("");
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);

  async function startQr() {
    setLoading(true);
    const { data, error } = await mfaDeviceStart();
    setLoading(false);
    if (error) { onToast(error, "err"); return; }
    setQrCode(data!.qrCode);
    setManual(data!.manualCode);
    setStep("qr");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await mfaDeviceConfirm(code, name.trim() || "Authenticator");
    setLoading(false);
    if (error) { onToast(error, "err"); return; }
    onToast("Autenticatore aggiunto con successo!", "ok");
    onAdded(data!.device);
  }

  return (
    <div className="rounded-xl border border-accent-primary/25 bg-accent-primary/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white flex items-center gap-1.5">
          <QrCode size={13} className="text-accent-primary" />
          {step === "name" ? "Nuovo autenticatore" : step === "qr" ? "Scansiona il QR" : "Inserisci il codice"}
        </p>
        <button onClick={onCancel} className="text-zinc-600 hover:text-zinc-400 text-[11px] transition-colors">Annulla</button>
      </div>

      {step === "name" && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Nome dispositivo <span className="text-zinc-600">(es. iPhone 15, Google Authenticator)</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Authenticator"
              maxLength={50}
              autoFocus
              className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-accent-primary/60 transition-all"
            />
          </div>
          <button
            onClick={startQr}
            disabled={loading}
            className="w-full rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
            Genera QR code
          </button>
        </div>
      )}

      {step === "qr" && (
        <div className="space-y-3">
          <p className="text-[11px] text-zinc-400">
            1. Apri la tua app autenticatore (Google Authenticator, Authy, 1Password…)<br />
            2. Aggiungi un nuovo account e scansiona il QR, oppure inserisci il codice manuale.<br />
            3. Clicca il pulsante in basso per inserire il codice di verifica.
          </p>
          {qrCode && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="QR code MFA" className="w-44 h-44 rounded-xl border border-bg-border" />
            </div>
          )}
          <div className="rounded-lg border border-bg-border bg-bg-base px-3 py-2">
            <p className="text-[10px] text-zinc-600 mb-1">Codice manuale:</p>
            <code className="text-xs text-zinc-300 break-all">{manual}</code>
          </div>
          <button onClick={() => setStep("code")}
            className="w-full rounded-lg bg-bg-base border border-accent-primary/40 px-4 py-2.5 text-sm text-accent-primary hover:border-accent-primary/70 transition-all">
            Ho aggiunto l&apos;account → Inserisci codice
          </button>
          <button onClick={() => setStep("name")} className="w-full text-xs text-zinc-600 hover:text-zinc-400 py-1 transition-colors">
            ← Torna indietro
          </button>
        </div>
      )}

      {step === "code" && (
        <form onSubmit={confirm} className="space-y-3">
          <p className="text-[11px] text-zinc-400">Inserisci il codice a 6 cifre generato dall&apos;app per verificare il nuovo autenticatore:</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            autoFocus
            className="w-full bg-bg-base border border-bg-border rounded-lg px-4 py-3 text-xl text-white text-center tracking-[0.4em] placeholder-zinc-700 outline-none focus:border-accent-primary/60 transition-all"
          />
          <button type="submit" disabled={loading || code.length !== 6}
            className="w-full rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Conferma e salva autenticatore
          </button>
          <button type="button" onClick={() => setStep("qr")} className="w-full text-xs text-zinc-600 hover:text-zinc-400 py-1 transition-colors">
            ← Torna al QR
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Main MFA section ─────────────────────────────────────────────────────────

function MfaSection({
  mfaEnabled, role, forceSetup, onToast, onMfaChange,
}: {
  mfaEnabled: boolean;
  role: string;
  forceSetup: boolean;
  onToast: (msg: string, t: "ok" | "err") => void;
  onMfaChange: (newMfaEnabled: boolean) => void;
}) {
  const isMandatory = ["admin", "master"].includes(role);
  const isMaster    = role === "master";

  const [devices,     setDevices]     = useState<MfaDevice[]>([]);
  const [loadingDev,  setLoadingDev]  = useState(true);
  const [showAddFlow, setShowAddFlow] = useState(false);

  async function loadDevices() {
    setLoadingDev(true);
    const { data } = await listMfaDevices();
    setDevices(data?.devices ?? []);
    setLoadingDev(false);
  }

  useEffect(() => { loadDevices(); }, []);

  // Auto-open add flow if forced setup and no devices yet
  useEffect(() => {
    if (forceSetup && !mfaEnabled && !loadingDev && devices.length === 0) {
      setShowAddFlow(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceSetup, loadingDev]);

  function handleRenamed(id: string, name: string) {
    setDevices(ds => ds.map(d => d.id === id ? { ...d, name } : d));
  }

  function handleDeleted(id: string, newMfaEnabled: boolean) {
    setDevices(ds => ds.filter(d => d.id !== id));
    onMfaChange(newMfaEnabled);
  }

  function handleAdded(device: MfaDevice) {
    setDevices(ds => [...ds, device]);
    setShowAddFlow(false);
    onMfaChange(true);
  }

  const hasDevices = devices.length > 0;

  return (
    <Section title="Verifica in due passaggi (MFA)" icon={<ShieldCheck size={16} />}>
      {/* Status badge */}
      <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-bg-base border border-bg-border">
        {hasDevices
          ? <>
              <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-emerald-400">MFA Attiva</p>
                <p className="text-[11px] text-zinc-600">
                  {devices.length === 1
                    ? "1 autenticatore registrato."
                    : `${devices.length} autenticatori registrati.`
                  }
                </p>
              </div>
            </>
          : <>
              <XCircle size={16} className={`flex-shrink-0 ${isMandatory ? "text-amber-400" : "text-zinc-600"}`} />
              <div>
                <p className={`text-xs font-medium ${isMandatory ? "text-amber-400" : "text-zinc-500"}`}>
                  MFA non attiva {isMandatory && "— obbligatoria per il tuo ruolo"}
                </p>
                <p className="text-[11px] text-zinc-600">
                  {isMandatory
                    ? "Configura almeno un autenticatore per poter accedere al gestionale."
                    : "Aggiungi un autenticatore per proteggere il tuo account."
                  }
                </p>
              </div>
            </>
        }
      </div>

      {/* Device list */}
      {loadingDev ? (
        <div className="flex justify-center py-3">
          <Loader2 size={18} className="text-zinc-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {devices.map(d => (
            <DeviceRow
              key={d.id}
              device={d}
              isMaster={isMaster}
              isLast={devices.length === 1}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
              onToast={onToast}
            />
          ))}
        </div>
      )}

      {/* Add flow or Add button */}
      {showAddFlow ? (
        <AddDeviceFlow
          onAdded={handleAdded}
          onCancel={() => setShowAddFlow(false)}
          onToast={onToast}
        />
      ) : (
        <button
          onClick={() => setShowAddFlow(true)}
          className="w-full rounded-lg border border-dashed border-accent-primary/30 bg-accent-primary/5 hover:bg-accent-primary/10 hover:border-accent-primary/50 px-4 py-2.5 text-sm text-accent-primary/80 hover:text-accent-primary transition-all flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          Aggiungi autenticatore
        </button>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SESSIONS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function SessionsSection({ onToast }: { onToast: (msg: string, t: "ok" | "err") => void }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    const { data } = await listSessions();
    setSessions(data?.sessions ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleRevoke(sid: string) {
    setRevoking(sid);
    const { error } = await revokeSession(sid);
    if (error) { onToast(error, "err"); setRevoking(null); return; }
    onToast("Sessione chiusa.", "ok");
    setSessions(s => s.filter(x => x.sid !== sid));
    setRevoking(null);
  }

  async function handleRevokeAll() {
    setLoading(true);
    const { data, error } = await revokeAllOtherSessions();
    if (error) { onToast(error, "err"); setLoading(false); return; }
    onToast(`${data?.revokedCount ?? 0} sessioni chiuse.`, "ok");
    await load();
  }

  const others = sessions.filter(s => !s.isCurrent);

  return (
    <Section title="Sessioni attive" icon={<Laptop size={16} />}>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="text-zinc-600 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-4">Nessuna sessione attiva.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.sid}
              className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                s.isCurrent ? "border-accent-primary/30 bg-accent-primary/5" : "border-bg-border bg-bg-base"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {uaIcon(s.ua)}
                <div className="min-w-0">
                  <p className="text-xs text-zinc-300 truncate">{uaLabel(s.ua)}</p>
                  <p className="text-[11px] text-zinc-600 truncate">
                    {s.ip ?? "IP sconosciuto"} · {s.isCurrent ? "Sessione corrente" : `Accesso: ${fmtDate(s.createdAt)}`}
                  </p>
                </div>
              </div>

              {s.isCurrent ? (
                <span className="text-[10px] font-medium text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">
                  Corrente
                </span>
              ) : (
                <button
                  onClick={() => handleRevoke(s.sid)}
                  disabled={revoking === s.sid}
                  className="flex-shrink-0 text-zinc-600 hover:text-red-400 disabled:opacity-50 transition-colors p-1 rounded"
                  title="Chiudi sessione"
                >
                  {revoking === s.sid
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />
                  }
                </button>
              )}
            </div>
          ))}

          {others.length > 0 && (
            <button onClick={handleRevokeAll}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all">
              <LogOut size={13} /> Chiudi tutte le altre sessioni ({others.length})
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function SecurityPageInner() {
  const { user, refresh } = useAuth();
  const searchParams      = useSearchParams();
  const router            = useRouter();

  const [toast,     setToast]     = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [mfaLocal,  setMfaLocal]  = useState<boolean | null>(null);

  const forceSetup  = searchParams.get("setup_mfa") === "1";
  const mfaEnabled  = mfaLocal ?? user?.mfaEnabled ?? false;
  const role        = user?.role ?? "user";

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function handleToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
  }

  async function handleMfaChange(newMfaEnabled: boolean) {
    setMfaLocal(newMfaEnabled);
    await refresh();
    // If we were in forced setup and MFA is now enabled, redirect to dashboard
    if (forceSetup && newMfaEnabled) {
      router.replace("/");
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <Loader2 size={28} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  const isMandatoryAndMissing = ["admin", "master"].includes(role) && !mfaEnabled;

  return (
    <div className="min-h-screen bg-bg-base text-white">
      {/* Header */}
      <div className="border-b border-bg-border bg-bg-card px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs shrink-0"
            >
              Overview
            </Link>
            <span className="text-zinc-700 text-xs shrink-0">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <Shield size={14} className="text-accent-primary shrink-0" />
              <h1 className="text-sm font-semibold text-white truncate">Sicurezza account</h1>
            </div>
          </div>
          {/* User menu — logout + navigation access from this sub-page */}
          <UserMenu />
        </div>
      </div>

      {/* MFA mandatory banner */}
      {isMandatoryAndMissing && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-6 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-2.5 text-amber-400 text-xs">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span>
              <strong>L&apos;MFA è obbligatoria</strong> per il ruolo {role}.
              Configura l&apos;autenticazione a due fattori per poter accedere al gestionale.
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <PasswordSection onToast={handleToast} />

        <MfaSection
          mfaEnabled={mfaEnabled}
          role={role}
          forceSetup={forceSetup}
          onToast={handleToast}
          onMfaChange={handleMfaChange}
        />

        <SessionsSection onToast={handleToast} />
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <Loader2 size={28} className="text-zinc-600 animate-spin" />
      </div>
    }>
      <SecurityPageInner />
    </Suspense>
  );
}
