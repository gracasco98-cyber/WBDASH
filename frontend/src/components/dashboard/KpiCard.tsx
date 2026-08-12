"use client";
import { useTheme } from "@/components/ThemeProvider";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  /** Optional channel split shown as micro-text below sub: e.g. "Shop €12k · Amzn €9k" */
  splitLine?: string;
  icon: React.ReactNode;
  accent: "green" | "blue" | "purple" | "amber" | "red";
  loading?: boolean;
}

// Per-theme hex/rgb — these feed inline styles (glow, icon background), which
// can't reference Tailwind classes, so unlike `cls` (theme-aware for free via
// the CSS-variable mechanism) each accent needs an explicit light/dark pair.
// Values match --accent-*-rgb in globals.css exactly — see
// docs/superpowers/specs/2026-08-12-color-redesign-foundation-design.md §2.
const accentMap = {
  green:  {
    light: { color: "#059669", rgb: "5,150,105" },
    dark:  { color: "#059669", rgb: "5,150,105" },
    cls: "text-accent-primary",
  },
  blue:   {
    light: { color: "#2a78d6", rgb: "42,120,214" },
    dark:  { color: "#3987e5", rgb: "57,135,229" },
    cls: "text-accent-blue",
  },
  purple: {
    light: { color: "#7c3aed", rgb: "124,58,237" },
    dark:  { color: "#9085e9", rgb: "144,133,233" },
    cls: "text-accent-purple",
  },
  amber:  {
    light: { color: "#eda100", rgb: "237,161,0" },
    dark:  { color: "#b5a500", rgb: "181,165,0" },
    cls: "text-accent-amber",
  },
  red:    {
    light: { color: "#e34948", rgb: "227,73,72" },
    dark:  { color: "#e66767", rgb: "230,103,103" },
    cls: "text-accent-red",
  },
};

export default function KpiCard({ label, value, sub, splitLine, icon, accent, loading }: KpiCardProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentEntry = accentMap[accent];
  const a = { ...(isDark ? accentEntry.dark : accentEntry.light), cls: accentEntry.cls };

  const darkBg   = `linear-gradient(135deg, #111118 0%, rgba(${a.rgb},0.08) 100%)`;
  const lightBg  = `linear-gradient(135deg, #ffffff 0%, rgba(${a.rgb},0.06) 100%)`;
  const darkBorder  = `rgba(${a.rgb},0.20)`;
  const lightBorder = `rgba(${a.rgb},0.35)`;

  return (
    <div
      className="rounded-xl border p-3 sm:p-4 card-hover relative overflow-hidden transition-all"
      style={{
        background:   isDark ? darkBg   : lightBg,
        borderColor:  isDark ? darkBorder : lightBorder,
      }}
    >
      {/* Corner glow */}
      <div
        className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl pointer-events-none"
        style={{ background: a.color, opacity: isDark ? 0.2 : 0.12, transform: "translate(30%, -30%)" }}
      />

      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className={`text-[10px] sm:text-xs font-medium uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
          {label}
        </span>
        <div
          className="w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: `rgba(${a.rgb},0.12)`, color: a.color }}
        >
          {icon}
        </div>
      </div>

      {loading ? (
        <div className={`h-6 sm:h-7 w-20 sm:w-24 rounded animate-pulse mb-1 ${isDark ? "bg-white/5" : "bg-slate-200"}`} />
      ) : (
        <div className={`text-xl sm:text-2xl font-semibold tabular-nums leading-none mb-1 ${a.cls}`}>
          {value}
        </div>
      )}

      {sub && (
        <div className={`text-xs truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{sub}</div>
      )}
      {splitLine && (
        <div className={`text-[10px] font-mono truncate mt-1 pt-1 border-t ${
          isDark ? "text-zinc-600 border-white/5" : "text-slate-400 border-slate-200"
        }`}>
          {splitLine}
        </div>
      )}
    </div>
  );
}
