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

const accentMap = {
  green:  { color: "#FFC300", rgb: "255,195,0",   cls: "text-accent-primary"  },
  blue:   { color: "#ECCB08", rgb: "236,203,8",   cls: "text-accent-blue"     },
  purple: { color: "#F5E080", rgb: "245,224,128", cls: "text-accent-purple"   },
  amber:  { color: "#D4AF00", rgb: "212,175,0",   cls: "text-accent-amber"    },
  red:    { color: "#F4B400", rgb: "244,180,0",   cls: "text-accent-red"      },
};

export default function KpiCard({ label, value, sub, splitLine, icon, accent, loading }: KpiCardProps) {
  const a = accentMap[accent];
  const { theme } = useTheme();
  const isDark = theme === "dark";

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
