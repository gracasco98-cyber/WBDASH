# App-wide Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make light the default theme for new visitors, and fix every remaining file that hardcodes dark-only Tailwind classes instead of the app's existing semantic theme tokens, so the whole dashboard renders correctly and consistently in light mode (Sellerboard-style) without regressing dark mode for users who've chosen it.

**Architecture:** No new theme system — `ThemeProvider.tsx` + CSS variables in `globals.css` + Tailwind tokens (`bg-bg-card`, `bg-bg-hover`, `border-bg-border`) already exist and already work correctly in 71+ files. This plan flips one default and fixes the small number of files that bypass the token system with hardcoded Tailwind dark-gray/black classes.

**Tech Stack:** Next.js 14 + Tailwind CSS, no new dependencies.

## Global Constraints

- Never remove the dark theme or the toggle — only the default changes.
- A `fixed inset-0 ... bg-black/NN backdrop-blur-sm` pattern is a modal backdrop dimming overlay, correct in both themes by convention — do NOT convert these to a token; leave them exactly as-is. (Confirmed present and correct in `AppHeader.tsx:107`, `ProductDetailModal.tsx:46`, `HourChannelModal.tsx:61`, `admin/users/page.tsx:91,186` — none of those four files need any other change from this plan.)
- Replace a hardcoded surface/card background with `bg-bg-card` (main card/panel) or `bg-bg-hover` (hover/secondary surface) — pick whichever matches the element's visual role, not just the first one that looks close.
- Replace a hardcoded border with `border-bg-border`.
- Leave `text-zinc-*`/`text-white` as-is unless a specific instance is flagged in a task — these already read correctly against both theme backgrounds per this codebase's existing convention (confirmed via `GlobalSidebar.tsx`'s established use of `text-zinc-400`/`text-zinc-500`/`text-white`).
- Every task: run `cd frontend && npx tsc --noEmit` and any existing test file for the touched component/page before committing.

---

## File Structure

**Modified:**
- `frontend/src/components/ThemeProvider.tsx` — default flip
- `frontend/src/components/dashboard/ShopifyBIOverview.tsx`
- `frontend/src/app/amazon/cogs/page.tsx`
- `frontend/src/app/amazon/inventory/page.tsx`
- `frontend/src/components/ChatWidget.tsx`
- `frontend/src/components/amazon/AmazonRevenueChart.tsx`
- `frontend/src/app/amazon/pl/page.tsx`
- `frontend/src/app/admin/users/page.tsx` (minor)

**Confirmed NOT touched (false positives from the initial survey — legitimate modal backdrops):**
`frontend/src/components/layout/AppHeader.tsx`, `frontend/src/components/products/ProductDetailModal.tsx`, `frontend/src/components/dashboard/HourChannelModal.tsx`

---

### Task 1: Flip `ThemeProvider` default to light

**Files:**
- Modify: `frontend/src/components/ThemeProvider.tsx`

**Interfaces:** No signature change — same `ThemeProvider`/`useTheme` exports, only the internal default value changes.

Current code (full file is 39 lines, already read in full for this plan):

```typescript
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const resolved = saved === "light" ? "light" : "dark";
    setTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);
```

- [ ] **Step 1: Flip the three "dark" defaults to "light"**

```typescript
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const resolved = saved === "dark" ? "dark" : "light";
    setTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);
```

This means: a user who previously saved `"dark"` explicitly (via the toggle) keeps seeing dark. Anyone with no saved preference (new visitor, or `localStorage` cleared) now gets light by default. `toggle()` itself is unchanged — still flips between the two.

- [ ] **Step 2: Check for any test file covering ThemeProvider**

Run: `cd frontend && find . -iname "ThemeProvider.test.*" -not -path "*/node_modules/*"`. If one exists, update any assertion that hardcodes an expectation of `"dark"` as the initial/default value. If none exists, skip.

- [ ] **Step 3: Typecheck and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean, all pass (this change has no logic beyond the two default values, should not break anything)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ThemeProvider.tsx
git commit -m "feat(theme): default to light theme for new visitors"
```

---

### Task 2: Fix hardcoded dark colors in `ShopifyBIOverview.tsx`

**Files:**
- Modify: `frontend/src/components/dashboard/ShopifyBIOverview.tsx` (821 lines)

**Interfaces:** No signature change — this is a pure styling fix.

**Known starting point** (found via `grep -n "bg-zinc-9" frontend/src/components/dashboard/ShopifyBIOverview.tsx`): line 126, a card-variant background at `bg-zinc-900/40`, inside a ternary alongside other accent-color variants (`bg-[#D4AF00]/8` etc. — those hex-based accent colors are fine, they're brand accent colors used consistently, not theme-dark colors — leave them). Read the surrounding function (the ternary this line belongs to) to understand what role this specific variant plays, then replace `bg-zinc-900/40` with `bg-bg-hover` (closest semantic match for a subtle card-background variant) unless reading the context reveals `bg-bg-card` fits better.

- [ ] **Step 1: Read the full file** to find the one known hit plus check for any other hardcoded dark-only classes my initial grep might have missed (search for `bg-zinc-`, `bg-gray-`, `bg-neutral-`, `bg-slate-`, `bg-black` — but leave any `bg-black/NN` inside a `fixed inset-0` backdrop pattern untouched per the Global Constraints).

- [ ] **Step 2: Replace each genuine hardcoded surface/border color with the matching token** (`bg-bg-card`, `bg-bg-hover`, `border-bg-border`), preserving any opacity modifier if the original had one and it still makes sense (e.g. `bg-zinc-900/40` → `bg-bg-hover/40` if partial transparency was intentional, or just `bg-bg-hover` if full opacity reads better — use judgment, this is a visual call).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Check for and run any test file covering this component**

Run: `cd frontend && find . -iname "ShopifyBIOverview.test.*" -not -path "*/node_modules/*"`. If found, run it and confirm it still passes (className changes shouldn't break behavior tests, but confirm).

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/ShopifyBIOverview.tsx
git commit -m "fix(theme): replace hardcoded dark colors with theme tokens in ShopifyBIOverview"
```

---

### Task 3: Fix hardcoded dark colors in `amazon/cogs/page.tsx`

**Files:**
- Modify: `frontend/src/app/amazon/cogs/page.tsx` (736 lines)

**Known starting points** (via `grep -n "bg-zinc-9\|bg-gray-9\|bg-black" frontend/src/app/amazon/cogs/page.tsx`): lines 187, 283, 293, 364, 453, 454 — a mix of `bg-zinc-900`, `bg-zinc-950`, `bg-black`. Read each in context before changing: if any `bg-black` hit is inside a `fixed inset-0 ... backdrop-blur` modal-overlay pattern (same shape as the Global Constraints example), leave it untouched — this page may have its own modal(s) with a legitimate backdrop. Every other hit (card backgrounds, section backgrounds, table row backgrounds) should move to `bg-bg-card` or `bg-bg-hover` as appropriate.

- [ ] **Step 1: Read the file fully**, identify which of the 6 known hits are genuine surface colors vs. legitimate modal backdrops, and check for any additional hardcoded dark classes beyond what the initial grep caught.

- [ ] **Step 2: Replace each genuine hardcoded surface/border color with the matching token.**

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Check for and run any test file for this page**

Run: `cd frontend && find . -iname "page.test.*" -path "*amazon/cogs*" -not -path "*/node_modules/*"`. If found, run and confirm passing.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/amazon/cogs/page.tsx
git commit -m "fix(theme): replace hardcoded dark colors with theme tokens in COGS page"
```

---

### Task 4: Fix hardcoded dark colors in `amazon/inventory/page.tsx`

**Files:**
- Modify: `frontend/src/app/amazon/inventory/page.tsx` (725 lines)

**Known starting points** (via `grep -n "bg-zinc-9" frontend/src/app/amazon/inventory/page.tsx`): lines 115, 460, 607 — all `bg-zinc-900`.

- [ ] **Step 1: Read the file fully**, confirm the 3 known hits are genuine surfaces (not modal backdrops — `bg-zinc-900` without `/NN` opacity is unlikely to be a backdrop, those are almost always `bg-black/NN`, but verify), check for any other hardcoded dark classes.

- [ ] **Step 2: Replace each with the matching token** (`bg-bg-card` or `bg-bg-hover`).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Check for and run any test file**

Run: `cd frontend && find . -iname "page.test.*" -path "*amazon/inventory*" -not -path "*/node_modules/*"`. If found, run and confirm passing.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/amazon/inventory/page.tsx
git commit -m "fix(theme): replace hardcoded dark colors with theme tokens in inventory page"
```

---

### Task 5: Fix hardcoded dark colors in `ChatWidget.tsx`

**Files:**
- Modify: `frontend/src/components/ChatWidget.tsx` (398 lines)

**Known starting points** (via `grep -n "bg-zinc-9" frontend/src/components/ChatWidget.tsx`): lines 248, 296, 324, 354, 368 — `bg-zinc-950`/`bg-zinc-900`. This is the floating AI assistant chat widget visible on every page (seen in every screenshot this session, bottom-right chat button) — check carefully since it floats above all page content and needs to look correct in both themes; also check whether the widget already has any of its own dark-only visual identity that might be intentional (e.g. always-dark chat bubble regardless of page theme, similar to how some chat widgets keep a consistent brand look) — if genuinely unsure whether a specific color is intentional brand styling vs. an unconverted theme bug, note it in your report rather than guessing, but the default assumption should be "convert to token" since this plan's whole point is theme consistency.

- [ ] **Step 1: Read the file fully**, identify genuine surface colors, check for any other hardcoded dark classes.

- [ ] **Step 2: Replace each with the matching token.**

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Check for and run any test file**

Run: `cd frontend && find . -iname "ChatWidget.test.*" -not -path "*/node_modules/*"`. If found, run and confirm passing.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatWidget.tsx
git commit -m "fix(theme): replace hardcoded dark colors with theme tokens in ChatWidget"
```

---

### Task 6: Fix hardcoded dark colors in `AmazonRevenueChart.tsx`

**Files:**
- Modify: `frontend/src/components/amazon/AmazonRevenueChart.tsx` (245 lines)

**Known exact hits** (already read in full for this plan):

```tsx
// line 47
<div className="bg-[#0f0f1a] border border-zinc-800 rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[200px]">
// line 65
<div className="bg-[#0f0f1a] border border-zinc-800 rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[160px]">
```

Both are chart tooltip popups (Recharts custom tooltip content). Replace `bg-[#0f0f1a]` with `bg-bg-card` and `border-zinc-800` with `border-bg-border` in both. The `text-zinc-400` label inside each tooltip (line 48/66 area) can stay as-is per the Global Constraints.

- [ ] **Step 1: Make the two replacements above.**

- [ ] **Step 2: Read the rest of the file for any other hardcoded dark classes** the initial narrow grep might have missed (chart axis colors, grid line colors passed as hex props to Recharts components — these are a different category, likely passed as `stroke`/`fill` props rather than className, and may need a similar token-based fix if they're hardcoded to dark-only hex values; check and fix if found, following the same "use judgment, note if unsure" guidance as Task 5).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Check for and run any test file**

Run: `cd frontend && find . -iname "AmazonRevenueChart.test.*" -not -path "*/node_modules/*"`. If found, run and confirm passing.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/amazon/AmazonRevenueChart.tsx
git commit -m "fix(theme): replace hardcoded dark colors with theme tokens in AmazonRevenueChart"
```

---

### Task 7: Fix hardcoded dark colors in `amazon/pl/page.tsx`

**Files:**
- Modify: `frontend/src/app/amazon/pl/page.tsx` (228 lines)

**Known starting points** (via `grep -n "bg-zinc-9" frontend/src/app/amazon/pl/page.tsx`): lines 132, 172 — `bg-zinc-900`.

- [ ] **Step 1: Read the file fully**, confirm the 2 known hits are genuine surfaces, check for any other hardcoded dark classes.

- [ ] **Step 2: Replace each with the matching token.**

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Check for and run any test file**

Run: `cd frontend && find . -iname "page.test.*" -path "*amazon/pl*" -not -path "*/node_modules/*"`. If found, run and confirm passing.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/amazon/pl/page.tsx
git commit -m "fix(theme): replace hardcoded dark colors with theme tokens in P&L page"
```

---

### Task 8: Fix minor hardcoded colors in `admin/users/page.tsx` badges

**Files:**
- Modify: `frontend/src/app/admin/users/page.tsx` (574 lines)

**Known exact hits** (already read for this plan) — these are small status/action badges, NOT the two modal backdrops (`bg-black/60` at lines 91 and 186, which are correct and must stay untouched):

```tsx
// line 41
return <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-zinc-600" /> Disattivato</span>;
// line 559
LOGOUT:         "text-zinc-400 bg-zinc-400/8 border-zinc-400/20",
// line 570 (fallback in the same color map as line 559)
... ?? "text-zinc-500 bg-zinc-500/8 border-zinc-500/20"
```

These are low-opacity (`/8`, `/20`) tinted badges — likely acceptable in both themes as-is, but this task exists to make a deliberate call rather than leave it unchecked. Read the surrounding `colors` map (around line 550-570) to see the full set of badge color variants used for different user actions/statuses, and judge whether the zinc-based "neutral/inactive" variant needs adjustment to read correctly on a light card background, or whether it's fine unchanged (low-opacity zinc tints tend to work reasonably in both themes). If you judge it needs a fix, apply the same token-replacement approach as other tasks; if you judge it's fine, say so explicitly in your report rather than silently skipping.

- [ ] **Step 1: Read the `colors` map and the two other cited lines, make a judgment call, apply a fix if warranted.**

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Check for and run any test file**

Run: `cd frontend && find . -iname "page.test.*" -path "*admin/users*" -not -path "*/node_modules/*"`. If found, run and confirm passing.

- [ ] **Step 4: Run the full frontend suite**

Run: `cd frontend && npx vitest run`

- [ ] **Step 5: Commit** (even if the judgment was "no change needed," still commit if Step 1 made any edit; if truly no edit was made, skip the commit and say so in the report)

```bash
git add frontend/src/app/admin/users/page.tsx
git commit -m "fix(theme): review and adjust neutral badge colors in admin users page"
```

---

### Task 9: Visual verification pass

**Files:** None modified — this is a verification-only task.

- [ ] **Step 1: Confirm the full frontend suite is green** (should already be true from prior tasks, but confirm as a baseline before visual work)

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

- [ ] **Step 2: Start the dev servers for this worktree**

Check if a backend dev Postgres container and `.env` already exist for this worktree from prior work on this branch (look for `backend/.env` with a `DATABASE_URL`, and check `docker ps` for a running Postgres container). If they exist, reuse them. If not, you'll need to set up a local dev Postgres the same way documented in this plan's prior sibling work on this branch (a `docker run` Postgres container + `backend/.env` + `npx prisma migrate deploy`) — check `docs/superpowers/plans/2026-08-04-product-entity-and-table.md` and `docs/superpowers/plans/2026-08-04-home-page-product-bi.md` in this same repo for how this was done before, and mirror it. Start the backend (`cd backend && npm run dev`, confirm `SESSION_SECRET` is set in `.env` or add one — see prior plans for the exact throwaway value used) and frontend (`cd frontend && npx next dev -p <a free port>`) on ports that don't collide with anything already running (check `lsof -iTCP -sTCP:LISTEN -P` first).

- [ ] **Step 3: Log in** (seed a throwaway master account via `MASTER_EMAIL=... MASTER_PASSWORD=... npx ts-node -r dotenv/config src/seed-admin.ts` from `backend/`, matching the pattern in the prior plans on this branch; delete it again in Step 5)

- [ ] **Step 4: Using chrome-devtools MCP tools, navigate to and screenshot at least these 5 pages, confirming no illegible text (light-on-light or dark-on-dark), no console errors beyond expected auth/data-related ones (e.g. 403s from the throwaway account lacking MFA are expected and fine, per prior plans on this branch):**
  - `/` (home — Tiles view)
  - `/amazon` (Overview)
  - `/amazon/pl` (P&L — touched by Task 7)
  - `/amazon/cogs` (COGS — touched by Task 3)
  - `/ordini`

For each, take a full-page screenshot and read it back to confirm the page looks like a coherent light theme (matches the sidebar/header, which should already be correctly light per the existing token system) with no dark patches, no invisible text, and correctly-converted chart tooltips (hover a chart if one is visible on a page, to trigger `AmazonRevenueChart`'s tooltip from Task 6, if that component is used on any of these 5 pages — check first).

- [ ] **Step 5: Clean up** — delete the throwaway master account (same script pattern, `deleteMany` by email), stop the dev servers you started (only if you started new ones in Step 2 — leave any you found already running from prior work).

- [ ] **Step 6: Write a verification report** to a new file `docs/superpowers/plans/2026-08-05-light-theme-visual-verification.md` — one entry per page checked, screenshot findings (pass/fail with description), and any follow-up issues discovered that this plan's 8 fix tasks didn't anticipate (file it as a note, don't attempt to fix new issues found here — that's follow-up work, not this task's job).

- [ ] **Step 7: Commit the verification report**

```bash
git add docs/superpowers/plans/2026-08-05-light-theme-visual-verification.md
git commit -m "docs: record visual verification of app-wide light theme rollout"
```

---

## Self-Review Notes

**Spec coverage:** Task 1 covers the default flip. Tasks 2-8 cover all files identified as genuinely needing changes (AppHeader.tsx, ProductDetailModal.tsx, HourChannelModal.tsx were surveyed and confirmed to need no changes — their only "hardcoded dark" hits are correct modal-backdrop overlay patterns, explicitly called out in Global Constraints so no task wastes effort re-discovering this). Task 9 covers the spec's required visual verification step.

**Type consistency:** N/A — this plan is pure Tailwind className changes plus one boolean-like default flip, no new types or interfaces introduced.

**Known ambiguity flagged inline, not hidden:** Tasks 5, 6, and 8 each explicitly tell the implementer where a judgment call is needed (chat widget brand identity, Recharts prop-based colors vs. className, badge color acceptability) rather than dictating an exact answer I can't verify without seeing the rendered result myself — each instructs the implementer to document their reasoning in the report rather than silently guessing.
