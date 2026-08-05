# Visual verification — app-wide light theme rollout (Task 9)

Verification-only pass, no code changes. Ran against the frontend dev server on
`http://localhost:3010` (backend on `:3011`) using chrome-devtools MCP tools, with a
throwaway login (`lighttheme-verify@example.com`, deleted at the end of this session).

`task-9-brief.md` did not exist in `.superpowers/sdd/2026-08-05-app-wide-light-theme/`
(only tasks 1–8 have briefs/reports there). Steps below follow the Task 9 section of
`docs/superpowers/plans/2026-08-05-app-wide-light-theme.md` plus the orchestrator's
inline instructions for this session (reuse already-running dev servers/seeded login
instead of starting new ones or seeding a master account).

## Default theme check

**PASS.** Opened the app in a fresh isolated browser context (no prior localStorage).
The `/login` page rendered fully light (white card, light gray page background, dark
legible text) before any authentication happened, and
`document.documentElement.getAttribute('data-theme')` read `"light"` with an empty
`localStorage`. Confirms Task 1's default-light flip holds for a first-time visitor.

## Page-by-page results

### `/` (home — Tiles view)

**PASS**, with one note. Header, sidebar, filter bar, and the "PRODOTTI" table shell
all render in clean light theme. The BUSINESS INTELLIGENCE period tiles (`PeriodTiles`)
and the products table (`ProductsPerformanceTable`) render **legibly light**, not
dark — see "Notable finding A" below for why this contradicts the brief's stated
assumption that these two components were "deliberately left dark themed." Nothing
is illegible; both components look like ordinary light cards consistent with the
rest of the page. Console showed only expected `403` noise from
`AmazonAccountContext`/`PeriodTiles`/`DashboardPage` (throwaway account has no
Amazon account configured).

### `/amazon` (Overview — `ShopifyBIOverview`, Task 2)

**PASS.** Tiles/Chart/Trends sub-tabs, KPI comparison cards (peach/purple/yellow/gray
headers), the red `Errore caricamento overview: API error 403` banner (legible red-on-
white with a light red background, not a leftover dark box), and all three empty-state
panels ("Nessun prodotto venduto...", "Nessun dato disponibile — esegui un backfill dal
Sync Center", "Nessun dato settlement disponibile") render correctly in light theme.
No dark patches on desktop. See "Notable finding C" for a real (if narrow) leftover-dark
bug in this same component family, but only at mobile viewport width.

### `/amazon/pl` (P&L — Task 7)

**PASS.** Table header row, dropdowns ("12 mesi" / "Tutti"), the green "CSV" export
button, and the "Nessun dato disponibile" empty state are all light and legible.
Spot-checked the previously-deferred `<option>` styling (Task 7's report flagged
`bg-zinc-900` on `<option>`): confirmed via DOM inspection it is now `bg-bg-card`
(white), matching progress.md's note that this was already fixed.

### `/amazon/cogs` (COGS — Task 3, has forms/inputs)

**PASS.** "Gestione COGS" header, the 4 stat cards (Prodotti Unici / Con Storico
Prezzi / Senza Storico / COGS Medio/Unità), the search input, and the empty-state
icon+message all render in light theme with legible dark text on white/light-gray
backgrounds. No dark-on-dark or light-on-light text found. Table had zero rows
(no COGS data in this dev DB) so the `hover:bg-white/[0.015]` row-hover deferred
minor from Task 3's report could not be exercised live — confirmed via source
instead (see "Notable finding D").

### `/ordini`

**PASS.** "Ordini" header, table column headers (CANALE / ORDINE / DATA / MARKETPLACE
/ TOTALE / STATO), and the "Nessun ordine nel periodo selezionato" empty state are
all clean light theme, fully legible.

## Chat widget (Task 5)

**PASS.** Opened the floating "Assistente AI" widget (bottom-right FAB) from the home
page. Panel renders with a white background, light-green accent header/icon, legible
dark text on the 6 suggested-question chips, and a clean bordered input field with a
green send button. No leftover dark box or illegible text.

## Chart tooltip (Task 6, `AmazonRevenueChart`)

**Not visually triggerable — verified via source instead.** This throwaway account has
no synced Amazon orders (persistent `403`s / empty DB), so the "Andamento Giornaliero -
Totale per Fascia Oraria" chart panel (which is where `AmazonRevenueChart` renders,
confirmed via `grep` in `frontend/src/app/amazon/page.tsx:1020`) always shows its
"Nessun dato disponibile" empty state — there is no data point to hover. Read
`frontend/src/components/amazon/AmazonRevenueChart.tsx`: `CustomTooltip` (lines 41–65)
uses `bg-bg-card border border-bg-border` (theme-reactive tokens), not a hardcoded dark
class, confirming Task 6's fix is in place structurally. Recommend a follow-up live
check once real Amazon order data exists in a dev/staging environment.

## `/admin/users`

**Not reachable with this account — as expected, not a bug.** Navigating there
redirected to `/account/security?setup_mfa=1` with the banner "L'MFA è obbligatoria
per il ruolo master. Configura l'autenticazione a due fattori per poter accedere al
gestionale." The throwaway account has the `master` role, which requires MFA before
any protected/admin area is reachable, and MFA was never configured for it. Screenshotted
the resulting security/MFA-setup page anyway since it's in-scope UI: it renders fully in
light theme (white cards, teal icon badges, orange warning banner, password rules list,
QR-code button, active-sessions list) — no issues found there either.

## Notable findings (follow-up, not fixed — out of scope for this verification task)

**A. `PeriodTiles` (home) and `ProductsPerformanceTable` (home) no longer look
"deliberately dark"; they look like ordinary light cards.** Both components (`frontend/
src/components/products/PeriodTiles.tsx`, `.../ProductsPerformanceTable.tsx`) still use
hardcoded dark Tailwind classes internally (`text-zinc-200`, `text-zinc-300`, `text-
zinc-400`, `text-zinc-500`, `text-white`, `bg-bg-hover` header strips), matching the
brief's premise that these were "deliberately left dark themed in a prior chapter."
But their outer containers use `bg-bg-card`, which now resolves to white in light
theme, and `globals.css` has broad `[data-theme="light"] .text-zinc-XXX { color: ...
!important }` overrides (lines ~128–134) that convert all that hardcoded dark text to
dark-on-light instead. Net effect: nothing is illegible or broken, but the components
no longer visually stand out as "intentionally dark and different" the way the brief
describes — they blend into the light page like everything else. This is a discrepancy
between stated design intent and current rendered behavior, not a legibility bug. Worth
a conversation with the team on whether that's an acceptable outcome of the global
override strategy, or whether these two components should be given an explicit
"always-dark" surface treatment instead of relying on classes that the override system
happens to catch.

**B. Text-encoding (mojibake) bug in `SellerboardKpiCards`, unrelated to theming.**
On `/amazon`'s "Chart" tab (or any render path using the Italian-labeled card variant:
"Vendite / Ordini/Unità / Resi/Annullati / Costo pubblicità / Comm. stimate / Payout
stimato"), placeholder dashes and accented characters render as literal mojibake in
the DOM — confirmed via `document.querySelectorAll` that actual text content is
`"â€”"` instead of `"—"`, and labels like `"UnitÃ "` / `"pubblicitÃ "` instead of
`"Unità"` / `"pubblicità"`. The default "Tiles" view of the same underlying data (with
English labels: "Sales / Ordini / Resi / Adv. cost / Est. payout / Net profit") renders
correctly with a proper "—", so the bug is isolated to one specific label/rendering
path, not the whole component. This looks like a UTF-8 double-encoding issue (possibly
in how that specific string literal is stored/transmitted), not a color/class issue —
out of scope for the light-theme project but worth its own bug ticket.

**C. Confirmed (visually, not just by source read): `SellerboardKpiCards.tsx:670`'s
mobile scroll-dot pagination indicator is a real leftover dark patch, on mobile
viewports only.** This was flagged as a deferred minor in Task 2's report ("check if
SellerboardKpiCards.tsx is even still live/used") — confirmed it is still live (renders
on `/amazon`'s Overview page, inside the mobile-only `sm:hidden` horizontal-scroll
branch, lines 646–673). The dot itself (`<div className="w-1 h-1 rounded-full bg-zinc-
700" />`, line 670) uses a bare `bg-zinc-700` class with no opacity suffix.
`globals.css` only overrides `.bg-zinc-700\/50` and `.hover\:bg-zinc-700:hover` — there
is no plain `.bg-zinc-700` override, so this class renders as real dark gray
(`#3f3f46`) even in light theme. Resized the browser to a 390×844 mobile viewport and
confirmed visually: five small dark dots sit clearly visible against the light page
background, directly below the KPI card carousel. Small (4px dots) but a genuine,
unambiguous leftover-dark-theme bug, invisible on desktop (where this whole branch is
`sm:hidden`), which is presumably why Tasks 1–8 didn't catch it.

**D. `amazon/cogs/page.tsx:655`'s row-hover state is nearly invisible on light
backgrounds — confirmed via source, could not exercise live (COGS table was empty in
this dev DB).** `hover:bg-white/[0.015]` is a 1.5%-opacity white overlay — a reasonable
subtle highlight against a dark background, but on the now-light COGS row background
it's imperceptible. This matches the deferred minor already flagged in Task 3's report.
Recommend swapping to a token like `hover:bg-bg-hover` (already used elsewhere in this
codebase) or an equivalent light-mode-aware hover class.

**E. Pre-existing, unrelated to the theme project: a Next.js dev-mode-only hydration
warning.** `AppHeader`'s live clock text occasionally differs by ~1 second between
server-render and client-hydration ("Text content did not match. Server: '10:16:51'
Client: '10:16:52'"), surfacing as a dev-only "1 error" overlay badge. This is a
standard SSR/CSR timestamp-drift hydration mismatch, not a theme or color bug, does not
appear in production builds, and is not something Task 9 should fix.

## Session notes (not findings, just context for future verification runs)

Early in this session, clicking sidebar links via chrome-devtools MCP `click` with a
stale/reused a11y-snapshot `uid` occasionally resolved to the wrong element (e.g. a
click intended for "Overview" landing on "Ordini", or a click appearing to do nothing).
Switching to hard `navigate_page` calls with a URL, and re-fetching `take_snapshot`
immediately before every click, resolved this reliably — it was a tooling/usage
artifact of this verification session, not an app routing bug. No evidence of a real
session/auth flakiness was found once navigation was done carefully (all 5 required
pages loaded and stayed loaded on direct URL navigation).

## Summary

All 5 required pages, the chat widget, and the (source-verified) chart tooltip pass
visual verification for the light theme rollout — no illegible text, no broken/leftover
dark surfaces found on any of them at desktop viewport. `/admin/users` was not
reachable with this throwaway account (MFA required for its role) but the resulting
security page also passes. Two genuine, narrow, previously-deferred issues were
confirmed and are recommended as follow-up tickets (not fixed here, per this task's
verification-only scope):

- `SellerboardKpiCards.tsx:670` — bare `bg-zinc-700` scroll-dot, visible dark patch on
  mobile viewports only.
- `amazon/cogs/page.tsx:655` — `hover:bg-white/[0.015]` row-hover is effectively
  invisible in light theme.

Plus two out-of-scope, non-theme oddities noted for awareness (not follow-up tickets
against this project): a text-mojibake bug in one `SellerboardKpiCards` label variant,
and a routine Next.js dev-only clock hydration warning. Finding A (PeriodTiles /
ProductsPerformanceTable no longer reading as "intentionally dark") is a design-intent
question for the team, not a code defect.
