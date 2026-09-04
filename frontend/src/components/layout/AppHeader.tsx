"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import AmazonAccountSelector from "@/components/amazon/AmazonAccountSelector";
import MarketplaceFilterSelector from "@/components/layout/MarketplaceFilterSelector";
import { api } from "@/lib/api";
import { useSSE } from "@/hooks/useSSE";
import { onTaskStatusChanged } from "@/lib/taskEvents";

interface AppHeaderProps {
  accentColor?: "primary" | "amber";
  /** Rendered centered on desktop, in the hamburger drawer on mobile */
  centerContent?: React.ReactNode;
  /** Right-side controls (SyncStatus, clock, refresh) — already hidden on mobile via their own classes */
  rightExtras?: React.ReactNode;
  notificationCount?: number;
  onNotificationClick?: () => void;
}

export default function AppHeader({
  accentColor = "primary",
  centerContent,
  rightExtras,
  notificationCount = 0,
  onNotificationClick,
}: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Real, page-independent notification: how many open (non-DONE) tasks are
  // assigned to the current user. Refreshed live via SSE when someone
  // assigns a new one — the task list itself is the "inbox", no separate
  // notification model.
  const [taskCount, setTaskCount] = useState(0);
  const refreshTaskCount = useCallback(() => {
    api.tasks.list("assigned")
      .then(({ tasks }) => setTaskCount(tasks.filter(t => t.status !== "DONE").length))
      .catch(() => {});
  }, []);
  useEffect(() => { refreshTaskCount(); }, [refreshTaskCount]);
  useSSE((event) => { if (event === "task:assigned") refreshTaskCount(); });
  // Local status changes (e.g. completing a task from Task Manager or the
  // Bacheca widget) don't go through SSE — those components call
  // emitTaskStatusChanged() directly so the badge doesn't wait for a reload.
  useEffect(() => onTaskStatusChanged(refreshTaskCount), [refreshTaskCount]);

  const totalNotificationCount = notificationCount + taskCount;
  const handleBellClick = onNotificationClick ?? (() => router.push("/task-manager"));

  return (
    <>
      <header className="border-b border-bg-border px-3 md:px-5 flex items-center sticky top-0 z-40 bg-bg-card/95 backdrop-blur-sm h-[57px] shadow-sm">

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div
          onClick={() => router.push("/")}
          className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.ico"
            alt="WBDASH"
            className="h-8 w-8 rounded-lg object-contain shrink-0"
          />
          <span className="hidden sm:block leading-tight">
            <span className="font-bold text-white tracking-wide text-sm uppercase block">WBDASH</span>
            <span className="text-[8px] text-zinc-400 font-semibold tracking-[0.16em] block mt-0.5">COMMERCE OS</span>
          </span>
        </div>

        {/* ── Center slot — ONLY on md+ (hidden on mobile, shown in drawer).
             flex-1 + min-w-0 so it shares space with the logo/right cluster
             instead of floating absolutely-centered over them — the right
             cluster grew (account + marketplace selectors are now always
             visible here), which made the old absolute-centered slot
             overlap it on common viewport widths. ── */}
        {centerContent && (
          <div className="hidden md:flex flex-1 min-w-0 items-center justify-center overflow-x-auto scrollbar-hide px-2">
            {centerContent}
          </div>
        )}

        {/* ── Right cluster ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 md:gap-2 ml-auto shrink-0">

          <MarketplaceFilterSelector />
          <AmazonAccountSelector />

          {/* Page-specific extras (SyncStatus, clock, refresh) — hidden on mobile via own classes */}
          {rightExtras}

          {/* Notification bell — page-specific live-order count (if passed) + open tasks assigned to me */}
          <button
            onClick={handleBellClick}
            className="relative p-1.5 rounded-lg border border-bg-border text-zinc-400 hover:text-white hover:bg-bg-card transition-colors"
            aria-label="Notifiche"
          >
            <Bell size={14} />
            {totalNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-[9px] font-bold flex items-center justify-center leading-none" style={{ color: '#ffffff' }}>
                {totalNotificationCount > 9 ? "9+" : totalNotificationCount}
              </span>
            )}
          </button>

          {/* ThemeToggle — hidden on mobile (saves space) */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          {/* UserMenu */}
          <UserMenu />

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setOpen(v => !v)}
            className="md:hidden p-1.5 rounded-lg hover:bg-bg-card border border-bg-border text-zinc-400 hover:text-white transition-colors"
            aria-label={open ? "Chiudi menu" : "Apri menu"}
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setOpen(false)}
        >
          <nav
            className="absolute top-[57px] left-0 right-0 bg-bg-base border-b border-bg-border px-4 py-3 flex flex-col gap-1"
            onClick={e => e.stopPropagation()}
          >
            {/* View tabs (Tiles/Chart/P&L/Trends) — shown at top of drawer */}
            {centerContent && (
              <div className="pb-3 border-b border-bg-border mb-2">
                {centerContent}
              </div>
            )}
            {/* Nav links */}
            <a href="/"              onClick={() => setOpen(false)} className="px-3 py-2.5 text-sm rounded-lg text-zinc-400 hover:text-white hover:bg-bg-card transition-all">Dashboard</a>
            <a href="/products"      onClick={() => setOpen(false)} className="px-3 py-2.5 text-sm rounded-lg text-zinc-400 hover:text-white hover:bg-bg-card transition-all">Marketplace</a>
            <a href="/amazon"        onClick={() => setOpen(false)} className="px-3 py-2.5 text-sm rounded-lg text-zinc-400 hover:text-white hover:bg-bg-card transition-all">Amazon</a>
            <a href="/bacheca"       onClick={() => setOpen(false)} className="px-3 py-2.5 text-sm rounded-lg text-zinc-400 hover:text-white hover:bg-bg-card transition-all">Bacheca</a>
            <a href="/task-manager"  onClick={() => setOpen(false)} className="px-3 py-2.5 text-sm rounded-lg text-zinc-400 hover:text-white hover:bg-bg-card transition-all">Task Manager</a>
            {/* ThemeToggle in drawer on mobile */}
            <div className="pt-2 border-t border-bg-border mt-1 flex items-center gap-2 px-3">
              <span className="text-xs text-zinc-500">Tema</span>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
