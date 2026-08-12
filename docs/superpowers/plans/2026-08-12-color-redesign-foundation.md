# Color Redesign Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite WBDASH's accent color system (`accent.primary/blue/amber/red/purple`) onto a validated, CVD-safe, theme-aware palette using a CSS-variable-based mechanism that correctly themes `text-*`, `bg-*`, and `border-*` accent classes together (fixing a real bug where only text was theme-aware), then apply it to the global shell (`AppHeader`, `GlobalSidebar`, `KpiCard`) and the already-token-based Acquisti/Amministrazione dashboard. Also invoke the `frontend-design` skill during implementation for UI polish quality.

**Architecture:** One central change (Tailwind config + CSS variables) automatically re-themes every existing `text-accent-*`/`bg-accent-*`/`border-accent-*` usage across the whole app (165+ call sites) without touching those files. On top of that foundation, a small number of shell/dashboard-specific fixes: `KpiCard`'s broken `accentMap`, three Recharts components with hardcoded dark-only hex (both accent colors and grid/axis neutrals — the same class of bug already fixed once in this codebase via the `var(--bg-border)`/`var(--text-secondary)` pattern, reused here verbatim).

**Tech Stack:** Next.js 14 + Tailwind CSS + Recharts, same as the rest of this frontend. No test suite exists for styling/theme files in this codebase (confirmed: no `.test.ts(x)` for `globals.css`, `tailwind.config.js`, `KpiCard.tsx`, or any purchasing dashboard component) — verification here is `tsc --noEmit` + a real Tailwind build (to catch config syntax errors) + manual visual verification toggling both themes, matching this codebase's established pattern for CSS/theme work (see `docs/superpowers/specs/2026-08-05-app-wide-light-theme-design.md`, which used the same verification approach).

**Design doc:** `docs/superpowers/specs/2026-08-12-color-redesign-foundation-design.md` — read it for full rationale (palette validation method, the three bugs found, why the RGB-variable mechanism is correct). This plan restates only what each task needs.

## Global Constraints

- **Density unchanged**: no padding/spacing/layout changes anywhere in this plan — colors and theme-correctness only.
- **Green primary unchanged in identity**: `#059669`, now mode-invariant (same hex in both `:root` and `[data-theme="light"]`).
- **No new decisions mid-implementation**: every hex/RGB value used below was already validated in the design doc (§2, §2bis) with `scripts/validate_palette.js` from the `dataviz` skill — do not substitute or "improve" any value while implementing.
- **`frontend-design` skill**: invoke it before writing the shell-component and chart-component code in Tasks 3-5 (already installed this session — `claude plugin list` to confirm if unsure).
- **Verification per task**: `cd frontend && npx tsc --noEmit` (must stay clean throughout) plus `npx tailwindcss -i src/app/globals.css -o /tmp/wbdash-build-check.css -c tailwind.config.js` (a real build catches config syntax errors immediately; delete the output file after, it's a throwaway check, not a build artifact to commit).
- **Branch:** `feature/color-redesign-foundation`, already created off `develop` and currently checked out — it already holds one commit (the design doc). Do not create a new branch.

---

### Task 0: Verify branch state

**Files:** none (verification only).

- [ ] **Step 1:** Confirm you're on the right branch with the design doc already committed:
```bash
cd ~/Developer/WBDASH
git status --short --branch
git log -1 --oneline
```
Expected: `## feature/color-redesign-foundation` and the last commit is `docs: add color redesign foundation design spec`.

**Note on `AppHeader.tsx` / `GlobalSidebar.tsx` icon sizing:** the design doc (§4) lists these two files for icon-size standardization (13px group icons, 15px top-level link icons). A precise re-check during planning found they already match exactly — `GlobalSidebar.tsx` uses `size={13}` for group icons and `size={15}` for both top-level links (Dashboard, Ordini); `AppHeader.tsx`'s `Bell size={14}` and `Menu`/`X size={16}` are different UI roles (a notification badge context and a larger touch-target toggle, respectively), not an inconsistency to fix. **No task in this plan touches these two files** — this is a deliberate finding, not an oversight: the original brainstorming estimate ("13-16px senza criterio chiaro") turned out to be imprecise once measured exactly, and forcing a change against already-correct values would be unnecessary churn.

---

### Task 1: Rewrite the accent color mechanism (`globals.css` + `tailwind.config.js`)

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tailwind.config.js`

**Interfaces:**
- Produces: CSS custom properties `--accent-primary-rgb`, `--accent-blue-rgb`, `--accent-amber-rgb`, `--accent-red-rgb`, `--accent-purple-rgb` (both theme scopes), and Tailwind colors `accent.primary/blue/amber/red/purple` resolving to `rgb(var(--accent-*-rgb) / <alpha-value>)` — every later task and every pre-existing `text-accent-*`/`bg-accent-*`/`border-accent-*` usage in the app depends on these exact variable names.

- [ ] **Step 1: Add the RGB CSS variables to `frontend/src/app/globals.css`**

In the first `:root` block (currently lines 8-22), add the five `--accent-*-rgb` lines after `--scrollbar-thumb-hover`:

```css
:root {
  --font-geist: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'DM Mono', monospace;

  /* Default: dark theme */
  --bg-base:   #0a0a0f;
  --bg-card:   #111118;
  --bg-hover:  #16161f;
  --bg-border: #1e1e2e;
  --body-color: #e2e2f0;
  --text-secondary: #a1a1aa;  /* muted text for secondary elements */
  --scrollbar-track:  #0a0a0f;
  --scrollbar-thumb:  #2a2a3e;
  --scrollbar-thumb-hover: #3a3a5e;

  /* Accent colors — RGB triplets (not hex) so Tailwind's <alpha-value>
     mechanism can drive text/bg/border opacity variants from one source.
     See docs/superpowers/specs/2026-08-12-color-redesign-foundation-design.md
     §2bis — validated with the dataviz skill's palette validator, not
     chosen by eye. Primary is mode-invariant (same triplet in both themes). */
  --accent-primary-rgb: 5, 150, 105;    /* #059669 */
  --accent-blue-rgb:    57, 135, 229;   /* #3987e5 */
  --accent-amber-rgb:   181, 165, 0;    /* #b5a500 */
  --accent-red-rgb:     230, 103, 103;  /* #e66767 */
  --accent-purple-rgb:  144, 133, 233;  /* #9085e9 */
}
```

- [ ] **Step 2: Add the light-theme RGB overrides to the first `[data-theme="light"]` block**

Currently lines 24-34, add the five `--accent-*-rgb` overrides after `--scrollbar-thumb-hover`:

```css
[data-theme="light"] {
  --bg-base:   #f5f6fa;       /* very subtle off-white, not blinding */
  --bg-card:   #ffffff;       /* pure white cards stand out clearly */
  --bg-hover:  #f0f1f6;       /* light hover */
  --bg-border: #e4e5ef;       /* visible but subtle */
  --body-color: #111827;      /* near-black text for maximum contrast */
  --text-secondary: #6b7280;  /* muted text for secondary elements */
  --scrollbar-track:  #f5f6fa;
  --scrollbar-thumb:  #c7c9d9;
  --scrollbar-thumb-hover: #9395a8;

  /* Accent colors — light-mode RGB triplets. Primary matches :root exactly
     (mode-invariant); blue/amber/red/purple differ — see design doc §2. */
  --accent-primary-rgb: 5, 150, 105;    /* #059669 */
  --accent-blue-rgb:    42, 120, 214;   /* #2a78d6 */
  --accent-amber-rgb:   237, 161, 0;    /* #eda100 */
  --accent-red-rgb:     227, 73, 72;    /* #e34948 */
  --accent-purple-rgb:  124, 58, 237;   /* #7c3aed */
}
```

- [ ] **Step 3: Remove the now-redundant manual `.text-accent-*` override block**

Find and delete this entire block (currently around lines 251-256, inside the "LIGHT THEME" section — search for the comment `/* ── Accent colors vividi (non pastello) ── */` to locate it precisely, since line numbers may have shifted slightly after Steps 1-2):

```css
/* ── Accent colors vividi (non pastello) ─────────────────────────────────────── */
[data-theme="light"] .text-accent-primary   { color: #059669 !important; }   /* verde saturato */
[data-theme="light"] .text-accent-secondary { color: #7c3aed !important; }
[data-theme="light"] .text-accent-amber     { color: #d97706 !important; }
[data-theme="light"] .text-accent-red       { color: #dc2626 !important; }
[data-theme="light"] .text-accent-blue      { color: #1d4ed8 !important; }   /* blu vivido */
```

Delete the whole block including its comment line — the new RGB-variable mechanism (Steps 1-2 + Task 1 Step 4) fully replaces it, including fixing the `.text-accent-secondary` bug (that class never matched anything real — see design doc §3.2) by making the concept of a separate text-only override unnecessary.

- [ ] **Step 4: Rewrite the accent colors in `frontend/tailwind.config.js`**

Change:
```js
        accent: {
          primary: "#6ee7b7",
          blue:    "#60a5fa",
          amber:   "#fbbf24",
          red:     "#f87171",
          purple:  "#a78bfa",
        },
```
to:
```js
        accent: {
          primary: "rgb(var(--accent-primary-rgb) / <alpha-value>)",
          blue:    "rgb(var(--accent-blue-rgb) / <alpha-value>)",
          amber:   "rgb(var(--accent-amber-rgb) / <alpha-value>)",
          red:     "rgb(var(--accent-red-rgb) / <alpha-value>)",
          purple:  "rgb(var(--accent-purple-rgb) / <alpha-value>)",
        },
```

- [ ] **Step 5: Verify with a real Tailwind build**

```bash
cd ~/Developer/WBDASH/frontend
npx tailwindcss -i src/app/globals.css -o /tmp/wbdash-build-check.css -c tailwind.config.js
grep -A2 "^\.text-accent-blue " /tmp/wbdash-build-check.css
grep -A2 "^\.bg-accent-amber\\\\/10 " /tmp/wbdash-build-check.css
rm /tmp/wbdash-build-check.css
```
Expected: the build completes with no errors, and both grep results show `rgb(var(--accent-blue-rgb) / ...)` / `rgb(var(--accent-amber-rgb) / ...)` — i.e., the variable reference survived compilation, not a hardcoded triplet. If a class doesn't appear in the output, it's because no file in `content` currently uses that exact class+opacity combination — not a failure of this task; the mechanism is verified structurally in Task 1, and its effect on real usages is confirmed visually in Task 6.

- [ ] **Step 6: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/app/globals.css frontend/tailwind.config.js
git commit -m "feat(theme): rewrite accent colors as theme-aware CSS variables

Replaces hardcoded per-theme hex in tailwind.config.js with RGB CSS
custom properties (--accent-*-rgb) driving Tailwind's <alpha-value>
mechanism, so text/bg/border accent classes at any opacity all theme
correctly from one source instead of only text-accent-* (which had
its own manual override block, now redundant and removed). Also
fixes text-accent-secondary, a light-theme override that never
matched any real class (the app uses text-accent-purple everywhere;
purple silently had no light-mode color until now).

New palette values validated with the dataviz skill's
scripts/validate_palette.js (CVD-safety + lightness band), not
chosen by eye — see docs/superpowers/specs/2026-08-12-color-redesign-foundation-design.md."
```

---

### Task 2: Fix `KpiCard.tsx`'s broken `accentMap`

**Files:**
- Modify: `frontend/src/components/dashboard/KpiCard.tsx`

**Interfaces:**
- Consumes: the accent RGB variables from Task 1 (indirectly, via matching hex/rgb literals — `KpiCard` uses inline `style` for its glow/icon-background, which cannot reference Tailwind's opacity classes, so it needs its own theme-aware hex/rgb pair per accent).
- Produces: a corrected `accentMap` with real per-theme colors — used by every KPI tile across the app (home dashboard, Amazon pages, Acquisti dashboard).

- [ ] **Step 1: Replace the broken `accentMap` and add theme-aware color selection**

The current bug: `accentMap`'s hex/rgb values are all gold/yellow regardless of label (see design doc §3.1), and the map only has ONE value per accent (no light/dark distinction), which was already wrong for blue/amber/red/purple even before this bug (only primary is mode-invariant).

Change:
```tsx
const accentMap = {
  green:  { color: "#FFC300", rgb: "255,195,0",   cls: "text-accent-primary"  },
  blue:   { color: "#ECCB08", rgb: "236,203,8",   cls: "text-accent-blue"     },
  purple: { color: "#F5E080", rgb: "245,224,128", cls: "text-accent-purple"   },
  amber:  { color: "#D4AF00", rgb: "212,175,0",   cls: "text-accent-amber"    },
  red:    { color: "#F4B400", rgb: "244,180,0",   cls: "text-accent-red"      },
};
```
to:
```tsx
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
```

- [ ] **Step 2: Pick the right variant based on the existing `isDark` flag**

The component already computes `isDark` from `useTheme()` right after `accentMap[accent]` is looked up. Change:
```tsx
export default function KpiCard({ label, value, sub, splitLine, icon, accent, loading }: KpiCardProps) {
  const a = accentMap[accent];
  const { theme } = useTheme();
  const isDark = theme === "dark";
```
to:
```tsx
export default function KpiCard({ label, value, sub, splitLine, icon, accent, loading }: KpiCardProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentEntry = accentMap[accent];
  const a = { ...(isDark ? accentEntry.dark : accentEntry.light), cls: accentEntry.cls };
```

No other lines in the component need to change — every remaining usage (`a.rgb`, `a.color`, `a.cls`) already reads through this same `a` binding.

- [ ] **Step 3: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/components/dashboard/KpiCard.tsx
git commit -m "fix(dashboard): correct KpiCard's accentMap and make it theme-aware

accentMap's hex/rgb values were all gold/yellow regardless of the
accent label (a leftover from an earlier experiment), so every KPI
tile's corner glow and icon background rendered yellow-ish no matter
which accent was requested — only the large number text (which used
the separate, correct \`cls\` Tailwind class) showed the right color.
Also gives each accent a real light/dark pair instead of one shared
value, matching the new palette (only green is mode-invariant)."
```

---

### Task 3: Make the three Acquisti dashboard charts theme-correct

**Files:**
- Modify: `frontend/src/components/purchasing/dashboard/StatusBreakdownChart.tsx`
- Modify: `frontend/src/components/purchasing/dashboard/OrdersOverTimeChart.tsx`
- Modify: `frontend/src/components/purchasing/dashboard/TopSuppliersChart.tsx`

**Interfaces:**
- Consumes: `--bg-border` / `--text-secondary` CSS variables (pre-existing, already used this exact way in `frontend/src/components/amazon/AmazonRevenueChart.tsx`), `useTheme()` hook (pre-existing, `@/components/ThemeProvider`).
- Produces: three chart components that render correctly in both themes — used by the `/acquisti` dashboard page (already built, not modified by this task).

Before you begin, read `frontend/src/components/amazon/AmazonRevenueChart.tsx` lines ~205-225 once, for reference — it already solves the exact same class of problem (hardcoded dark-only Recharts colors) with the exact pattern this task reuses (`stroke="var(--bg-border)"`, `tick={{ fill: "var(--text-secondary)", ... }}`).

- [ ] **Step 1: `StatusBreakdownChart.tsx` — replace all hardcoded hex**

Green here is mode-invariant (`#059669` in both themes per Task 1), so the bar fill needs no theme-detection logic, just the corrected hex. The grid/axis/tooltip-cursor colors are dark-only today and need the CSS-variable fix (same bug class as `AmazonRevenueChart.tsx` had, same fix).

Change:
```tsx
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="status" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(110,231,183,0.06)" }} />
            <Bar dataKey="count" fill="#6ee7b7" radius={[0, 4, 4, 0]} maxBarSize={20} />
```
to:
```tsx
            <CartesianGrid stroke="var(--bg-border)" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="status" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(5,150,105,0.06)" }} />
            <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} maxBarSize={20} />
```

- [ ] **Step 2: `OrdersOverTimeChart.tsx` — replace all hardcoded hex**

Same reasoning: green is mode-invariant, grid/axis get the CSS-variable fix.

Change:
```tsx
            <defs>
              <linearGradient id="gradOrdersOverTime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              interval="preserveStartEnd" tickFormatter={formatDay} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#2a2a3e", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="count" stroke="#6ee7b7" strokeWidth={2} fill="url(#gradOrdersOverTime)"
              dot={false} activeDot={{ r: 4, fill: "#6ee7b7", stroke: "#0a0a0f", strokeWidth: 2 }} />
```
to:
```tsx
            <defs>
              <linearGradient id="gradOrdersOverTime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--bg-border)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              interval="preserveStartEnd" tickFormatter={formatDay} />
            <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--bg-border)", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="count" stroke="#059669" strokeWidth={2} fill="url(#gradOrdersOverTime)"
              dot={false} activeDot={{ r: 4, fill: "#059669", stroke: "var(--bg-base)", strokeWidth: 2 }} />
```
Note `activeDot`'s `stroke` also changes from the hardcoded dark `#0a0a0f` to `var(--bg-base)` — it's meant to be a ring matching the chart surface so the dot "punches through," which only works if it tracks the active theme's actual base color.

- [ ] **Step 3: `TopSuppliersChart.tsx` — theme-aware blue + grid/axis fix**

Blue is **not** mode-invariant (`#2a78d6` light / `#3987e5` dark), so this file needs `useTheme()` (the other two don't, since green is mode-invariant).

Change:
```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatEUR } from "@/lib/marketplaces";
import type { TopSupplierEntry } from "@/lib/api/acquisti-dashboard";
```
to:
```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatEUR } from "@/lib/marketplaces";
import { useTheme } from "@/components/ThemeProvider";
import type { TopSupplierEntry } from "@/lib/api/acquisti-dashboard";
```

Change:
```tsx
export default function TopSuppliersChart({ data }: Props) {
  return (
```
to:
```tsx
export default function TopSuppliersChart({ data }: Props) {
  const { theme } = useTheme();
  const blueHex = theme === "dark" ? "#3987e5" : "#2a78d6";
  return (
```

Change:
```tsx
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} />
            <YAxis type="category" dataKey="legalName" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(96,165,250,0.06)" }} />
            <Bar dataKey="totalValue" fill="#60a5fa" radius={[0, 4, 4, 0]} maxBarSize={20} />
```
to:
```tsx
            <CartesianGrid stroke="var(--bg-border)" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} />
            <YAxis type="category" dataKey="legalName" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: `${blueHex}0f` }} />
            <Bar dataKey="totalValue" fill={blueHex} radius={[0, 4, 4, 0]} maxBarSize={20} />
```
(`${blueHex}0f` appends hex alpha `0f` ≈ 6% opacity, matching the original `rgba(...,0.06)` cursor highlight strength.)

- [ ] **Step 4: Typecheck and commit**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
git add frontend/src/components/purchasing/dashboard/StatusBreakdownChart.tsx frontend/src/components/purchasing/dashboard/OrdersOverTimeChart.tsx frontend/src/components/purchasing/dashboard/TopSuppliersChart.tsx
git commit -m "fix(purchasing): make Acquisti dashboard charts theme-correct

All three charts hardcoded dark-theme-only hex for both their accent
color (old palette values) and their grid/axis/tooltip neutrals —
the same class of bug already fixed once in this codebase for
AmazonRevenueChart.tsx via var(--bg-border)/var(--text-secondary),
reused here verbatim. Green (Status/OrdersOverTime) is mode-invariant
in the new palette so needs no theme detection; blue (TopSuppliers)
is not, so that chart now reads the active theme to pick its hex."
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**
```bash
cd ~/Developer/WBDASH/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Real Tailwind build sanity check**
```bash
cd ~/Developer/WBDASH/frontend
npx tailwindcss -i src/app/globals.css -o /tmp/wbdash-build-check.css -c tailwind.config.js
grep -c "accent-rgb\|--accent-" /tmp/wbdash-build-check.css || true
rm /tmp/wbdash-build-check.css
```
Expected: build completes without error (a config syntax mistake in Task 1 would throw here, not silently pass).

- [ ] **Step 3: Repo-wide search for any accent hex you might have missed**
```bash
cd ~/Developer/WBDASH/frontend
grep -rn "#6ee7b7\|#60a5fa\|#fbbf24\|#f87171\|#a78bfa" src/components/purchasing/dashboard/ src/components/dashboard/KpiCard.tsx src/components/layout/AppHeader.tsx src/components/layout/GlobalSidebar.tsx
```
Expected: no output. (Old palette hex values may legitimately still appear elsewhere in the app — e.g. `SalesChart.tsx` — that's fine, those files are explicitly out of scope for this phase per the design doc §4; this check is scoped only to the files this plan touched.)

- [ ] **Step 4: Manual browser verification — both themes**

With both dev servers running (`docker start wbdash-dev-postgres`, then `npm run dev` in `backend/` and `frontend/`):
1. Load `/acquisti` in **light** theme (default). Confirm: KPI tile glows/icon backgrounds show real colors matching their label (green for "Ordini in corso", blue for "Valore ordini in corso", purple for "Fornitori attivi" — not gold/yellow). Status breakdown chart bar is green, grid lines and axis labels are visible/legible (not black-on-white or invisible). Orders-over-time chart area is green-gradient, legible axes. Top-suppliers chart bar is the light blue (`#2a78d6`), legible axes.
2. Toggle to **dark** theme (theme switcher in the header). Reload or re-check `/acquisti`: same charts now show dark-mode hex (amber/red/purple would look different if visible elsewhere; on this page confirm top-suppliers bar switches to the darker blue `#3987e5`).
3. Visit any page with colored badges using the `bg-accent-*/NN border-accent-*/NN text-accent-*` pattern (e.g. `/admin` sync button, `/amazon/sync` status badges) in **light** theme — confirm badge background/border now visibly match the badge's text color (same hue family), not a mismatched dark tint. This is the core fix from Task 1 having its intended effect on files this plan never touched.
4. Confirm nothing else regressed: sidebar/header still render normally in both themes, no console errors.

- [ ] **Step 5: Final commit if Step 4 surfaced any fixes**

If manual verification found an issue, fix it, re-run `tsc --noEmit`, and commit the fix separately with a `fix(theme): ...` message.

---

## After this plan

Once merged, the next phases (already scoped in the design doc §4 as explicitly out of this phase) apply the same palette to the rest of the app: the sales dashboard (`/`), all Amazon pages, Acquisti detail pages (Fornitori/Ordini/Magazzini/Banche/Condizioni pagamento), and Admin — one phase at a time, same pattern as the earlier light-theme rollout. Watch for brand-colored yellows (e.g. Amazon's own channel color in `SalesChart.tsx`) that must **not** be swapped for `accent-amber` — they represent a different concept (channel identity, not semantic warning/amber).
