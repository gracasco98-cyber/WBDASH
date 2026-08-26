# Order Detail Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `/acquisti/ordini/[id]` (the purchase order detail page) into a two-column layout with a status-lifecycle stepper, per the approved design — pure frontend composition, no backend/API/data changes.

**Architecture:** A new pure-presentation `OrderStatusStepper` component maps `logisticStatus` to one of 7 visual steps (or a cancelled banner). The page's existing state/data-fetching/handlers are untouched — only the JSX layout changes: header card (PO number + stepper), two-column body (main: lines + receiving; sidebar: facts, status actions, collapsible history, danger zone).

**Tech Stack:** Next.js 14 + Tailwind (existing patterns), Vitest + @testing-library/react (existing pattern from `GlobalSidebar.test.tsx`).

## Global Constraints

- Zero new colors/tokens — reuse only `accent-primary` (done/green), `accent-blue` (active), `accent-red` (danger), `text-secondary`/`zinc-*`/`bg-*` already in use elsewhere in this codebase.
- Zero backend/API changes — this plan touches `frontend/**` only.
- Zero logic changes to existing state/handlers (`load`, `loadReceipts`, `handleTransition`, `handleDelete`) — only their JSX consumption is repositioned.
- The state machine (`backend/src/purchasing/purchase-order-state-machine.ts`) remains the sole source of truth for valid transitions — the stepper is presentation-only and must not encode any business rule (the existing `NEXT_STATUSES` mirror-with-comment convention already in the page file stays as-is).
- Responsive: sidebar stacks below main content below the `lg` breakpoint (Tailwind `lg:` prefix, matches existing breakpoint usage in this codebase, e.g. `sm:`/`md:` already used throughout the page).

---

### Task 1: `OrderStatusStepper` component

**Files:**
- Create: `frontend/src/components/purchasing/OrderStatusStepper.tsx`
- Test: `frontend/src/components/purchasing/OrderStatusStepper.test.tsx`

**Interfaces:**
- Produces: `export default function OrderStatusStepper({ logisticStatus }: { logisticStatus: LogisticStatus }): JSX.Element` — consumed by Task 2.
- Consumes: `LogisticStatus` type from `@/lib/api/purchase-orders` (already exported, unchanged).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/purchasing/OrderStatusStepper.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OrderStatusStepper from "./OrderStatusStepper";

describe("OrderStatusStepper", () => {
  it("renders all 7 step labels", () => {
    render(<OrderStatusStepper logisticStatus="DRAFT" />);
    for (const label of ["Bozza", "Inviato", "Confermato", "In produzione", "Pronto", "Spedito", "Ricevuto"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows a cancelled banner instead of the stepper for CANCELLED", () => {
    render(<OrderStatusStepper logisticStatus="CANCELLED" />);
    expect(screen.getByText("Ordine annullato")).toBeInTheDocument();
    expect(screen.queryByText("Bozza")).not.toBeInTheDocument();
  });

  it("marks PARTIALLY_SHIPPED as the active 'Spedito' step with a 'parziale' badge", () => {
    render(<OrderStatusStepper logisticStatus="PARTIALLY_SHIPPED" />);
    expect(screen.getByText("Spedito").className).toMatch(/text-accent-blue/);
    expect(screen.getByText("parziale")).toBeInTheDocument();
  });

  it("marks steps before the active one as done (green) and after as future (grey)", () => {
    render(<OrderStatusStepper logisticStatus="CONFIRMED" />);
    expect(screen.getByText("Bozza").className).toMatch(/text-accent-primary/);
    expect(screen.getByText("Inviato").className).toMatch(/text-accent-primary/);
    expect(screen.getByText("Confermato").className).toMatch(/text-accent-blue/);
    expect(screen.getByText("In produzione").className).toMatch(/text-zinc-600/);
  });

  it("does not show a 'parziale' badge for a full (non-partial) status", () => {
    render(<OrderStatusStepper logisticStatus="RECEIVED" />);
    expect(screen.queryByText("parziale")).not.toBeInTheDocument();
    expect(screen.getByText("Ricevuto").className).toMatch(/text-accent-blue/);
  });

  it("maps PARTIALLY_RECEIVED and COMPLETED onto the same 'Ricevuto' step as RECEIVED", () => {
    const { rerender } = render(<OrderStatusStepper logisticStatus="PARTIALLY_RECEIVED" />);
    expect(screen.getByText("Ricevuto").className).toMatch(/text-accent-blue/);
    rerender(<OrderStatusStepper logisticStatus="COMPLETED" />);
    expect(screen.getByText("Ricevuto").className).toMatch(/text-accent-blue/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/purchasing/OrderStatusStepper.test.tsx`
Expected: FAIL — `OrderStatusStepper.tsx` does not exist yet.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/purchasing/OrderStatusStepper.tsx`:

```tsx
import type { LogisticStatus } from "@/lib/api/purchase-orders";

interface Step {
  label: string;
  statuses: LogisticStatus[];
}

// 7 visual steps compress the 11-value LogisticStatus enum: PARTIALLY_SHIPPED
// shares "Spedito" with SHIPPED, PARTIALLY_RECEIVED shares "Ricevuto" with
// RECEIVED (and COMPLETED, not yet reachable by the state machine — FASE
// G/M). Presentation only — purchase-order-state-machine.ts remains the
// sole source of truth for what transitions are actually valid.
const STEPS: Step[] = [
  { label: "Bozza", statuses: ["DRAFT"] },
  { label: "Inviato", statuses: ["SENT"] },
  { label: "Confermato", statuses: ["CONFIRMED"] },
  { label: "In produzione", statuses: ["IN_PRODUCTION"] },
  { label: "Pronto", statuses: ["READY"] },
  { label: "Spedito", statuses: ["PARTIALLY_SHIPPED", "SHIPPED"] },
  { label: "Ricevuto", statuses: ["PARTIALLY_RECEIVED", "RECEIVED", "COMPLETED"] },
];

const PARTIAL_STATUSES: LogisticStatus[] = ["PARTIALLY_SHIPPED", "PARTIALLY_RECEIVED"];

export default function OrderStatusStepper({ logisticStatus }: { logisticStatus: LogisticStatus }) {
  if (logisticStatus === "CANCELLED") {
    return (
      <div className="text-xs px-3 py-2 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red inline-block">
        Ordine annullato
      </div>
    );
  }

  const activeIndex = STEPS.findIndex((s) => s.statuses.includes(logisticStatus));
  const isPartial = PARTIAL_STATUSES.includes(logisticStatus);

  return (
    <div className="flex gap-1.5 sm:gap-2">
      {STEPS.map((step, i) => {
        const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "future";
        return (
          <div key={step.label} className="flex-1 min-w-0 text-center">
            <div
              className={
                "border-b-2 pb-1.5 text-[9px] sm:text-[10px] font-semibold truncate transition-colors " +
                (state === "done"
                  ? "border-accent-primary text-accent-primary"
                  : state === "active"
                    ? "border-accent-blue text-accent-blue"
                    : "border-bg-border text-zinc-600")
              }
            >
              {step.label}
            </div>
            {state === "active" && isPartial && (
              <div className="text-[8px] font-normal text-accent-blue/70 mt-0.5">parziale</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/purchasing/OrderStatusStepper.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/purchasing/OrderStatusStepper.tsx frontend/src/components/purchasing/OrderStatusStepper.test.tsx
git commit -m "feat(purchasing): add OrderStatusStepper component"
```

---

### Task 2: Restructure the order detail page

**Files:**
- Modify: `frontend/src/app/acquisti/ordini/[id]/page.tsx`

**Interfaces:**
- Consumes: `OrderStatusStepper` (Task 1). `GoodsReceiptForm`, `GoodsReceiptsList` (existing, unchanged, only repositioned in the JSX tree). `api.purchaseOrders.*` (existing, unchanged — no new calls).
- Produces: no exports consumed elsewhere — this is a page component.

This task changes ONLY the JSX returned by the component (everything from `return (` to the final `);`). Every hook, state variable, and handler function above the `return` stays byte-for-byte identical — do not touch them.

- [ ] **Step 1: Replace the page's JSX**

In `frontend/src/app/acquisti/ordini/[id]/page.tsx`, add the import for the new component alongside the existing ones:

```tsx
import OrderStatusStepper from "@/components/purchasing/OrderStatusStepper";
```

Replace everything from `return (` to the final `);` (the whole rendered JSX, i.e. everything inside the component function after the `if (!po) return null;` guard) with:

```tsx
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-6xl px-4 md:px-6 py-4 md:py-6 space-y-4">

            <div className="rounded-xl border border-bg-border bg-bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg sm:text-xl font-bold text-white font-mono">{po.poNumber}</h1>
                {po.logisticStatus !== "CANCELLED" && (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary">
                    {STATUS_LABEL[po.logisticStatus]}
                  </span>
                )}
              </div>
              <OrderStatusStepper logisticStatus={po.logisticStatus} />
              {error && (
                <div className="mt-4 text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="flex flex-col lg:flex-row gap-4 items-start">
              <div className="flex-1 min-w-0 w-full space-y-4">

                <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
                  <h2 className="text-sm font-semibold text-white px-4 py-3 border-b border-bg-border">Righe</h2>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 text-left bg-bg-hover border-b border-bg-border">
                        <th className="px-3 py-2.5">Descrizione</th><th className="px-3 py-2.5">Ordinata</th>
                        <th className="px-3 py-2.5">Ricevuta</th><th className="px-3 py-2.5">Residua</th>
                        <th className="px-3 py-2.5">Prezzo unit.</th><th className="px-3 py-2.5">Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map(l => (
                        <tr key={l.id} className="border-b border-bg-border/40 text-zinc-300">
                          <td className="px-3 py-2.5">{l.description}</td>
                          <td className="px-3 py-2.5">{l.orderedQty}</td>
                          <td className="px-3 py-2.5">{l.receivedQty}</td>
                          <td className="px-3 py-2.5">{l.remainingQty}</td>
                          <td className="px-3 py-2.5">€ {l.unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2.5">€ {l.totalAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {po.lines.some(l => l.remainingQty > 0) && RECEIVABLE_STATUSES.includes(po.logisticStatus) && (
                  <div className="space-y-2">
                    {!showReceiptForm ? (
                      <button onClick={() => setShowReceiptForm(true)}
                        className="px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors">
                        + Registra DDT
                      </button>
                    ) : (
                      <GoodsReceiptForm
                        purchaseOrderId={id}
                        lines={po.lines.filter(l => l.remainingQty > 0)}
                        onDone={() => { setShowReceiptForm(false); load(); loadReceipts(); }}
                        onCancel={() => setShowReceiptForm(false)}
                      />
                    )}
                  </div>
                )}

                <GoodsReceiptsList receipts={receipts} />

              </div>

              <div className="w-full lg:w-72 shrink-0 space-y-4">

                <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3 text-xs">
                  <div><div className="text-zinc-500">Fornitore</div><div className="text-zinc-200">{po.supplier?.legalName}</div></div>
                  <div><div className="text-zinc-500">Magazzino</div><div className="text-zinc-200">{po.warehouse?.name}</div></div>
                  <div><div className="text-zinc-500">Data ordine</div><div className="text-zinc-200">{new Date(po.orderDate).toLocaleDateString("it-IT")}</div></div>
                  <div><div className="text-zinc-500">Valuta</div><div className="text-zinc-200">{po.currency}</div></div>
                </div>

                <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Azioni di stato</h2>
                  <div className="flex flex-col gap-2 items-stretch">
                    {NEXT_STATUSES[po.logisticStatus].map(next => (
                      <button
                        key={next}
                        disabled={transitioning}
                        onClick={() => handleTransition(next)}
                        className="px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 disabled:opacity-50 transition-colors text-center"
                      >
                        → {STATUS_LABEL[next]}
                      </button>
                    ))}
                    {NEXT_STATUSES[po.logisticStatus].length === 0 && <span className="text-xs text-zinc-600">Nessuna transizione disponibile da questo stato</span>}
                  </div>
                </div>

                <details className="rounded-xl border border-bg-border bg-bg-card p-5 group">
                  <summary className="text-sm font-semibold text-white cursor-pointer list-none flex items-center justify-between">
                    Storico stato
                    <span className="text-zinc-500 text-xs transition-transform group-open:rotate-180">⌄</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {po.statusHistory.length === 0 && <div className="text-xs text-zinc-600">Nessuna transizione registrata</div>}
                    {po.statusHistory.map(h => (
                      <div key={h.id} className="text-xs text-zinc-400">
                        {new Date(h.changedAt).toLocaleString("it-IT")} — {STATUS_LABEL[h.fromStatus]} → {STATUS_LABEL[h.toStatus]}
                        {h.note ? ` (${h.note})` : ""}
                      </div>
                    ))}
                  </div>
                </details>

                <div className="rounded-xl border border-accent-red/20 bg-bg-card p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-accent-red">Zona pericolosa</h2>
                  <p className="text-xs text-zinc-500">
                    Elimina definitivamente questo ordine, incluse le righe, lo storico stato e tutti i DDT registrati. Operazione irreversibile — per un ordine reale usa "Annulla" invece, che conserva lo storico.
                  </p>
                  {!showDeleteConfirm ? (
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="px-3 py-1.5 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-xs font-medium hover:bg-accent-red/20 transition-colors">
                      Elimina definitivamente
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs text-zinc-400">
                        Digita <span className="font-mono text-zinc-200">{po.poNumber}</span> per confermare:
                      </label>
                      <input
                        value={deleteConfirmInput}
                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                        className="w-full rounded-lg bg-bg-hover border border-bg-border px-2.5 py-1.5 text-zinc-200 text-xs font-mono"
                        placeholder={po.poNumber}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          disabled={deleting || deleteConfirmInput !== po.poNumber}
                          className="px-3 py-1.5 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-xs font-medium hover:bg-accent-red/20 disabled:opacity-40 transition-colors"
                        >
                          Conferma eliminazione
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput(""); }}
                          disabled={deleting}
                          className="px-3 py-1.5 rounded-lg border border-bg-border text-zinc-400 text-xs font-medium hover:bg-bg-hover transition-colors"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}
```

Note the changes from the previous version, all per the approved design: `max-w-4xl` → `max-w-6xl` (room for two columns); the status badge + `OrderStatusStepper` + the (now single, shared) error banner all live in the header card; the status-badge span is conditionally hidden when `CANCELLED` (the stepper's own red banner already communicates that); "Righe" and "Ricezioni" (DDT form/list) move into the main (left) column unchanged in their own internal logic; "Azioni di stato" buttons switch from `flex-wrap` pills to a full-width `flex-col` stack (narrower sidebar column); "Storico stato" becomes a `<details>` accordion instead of an always-open card; the danger zone is unchanged internally, just repositioned into the sidebar. `NEXT_STATUSES`, `RECEIVABLE_STATUSES`, `STATUS_LABEL` constants above the component are untouched.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `cd frontend && npm run dev` (backend dev server should already be running per earlier session state, or start it too: `cd backend && npm run dev`). Open the existing test order at `/acquisti/ordini/<id>` (the "TEST - da cancellare" one created earlier this session, or any order). Verify:
- Header card shows PO number, status badge, and the 7-step stepper with correct done/active/future coloring for the order's current status.
- Two-column layout: lines + DDT section on the left, facts/actions/history/danger-zone in a right sidebar, at desktop width.
- Resize the browser narrower than the `lg` breakpoint (~1024px) — sidebar should stack below the main content, stepper should remain readable (shrinks/truncates gracefully, doesn't overflow the page).
- Click "Storico stato" — it expands/collapses.
- If the order has any transition available, click it and confirm the stepper updates to the new status after the page reloads its data.
- Confirm the danger zone still requires typing the exact PO number before "Conferma eliminazione" becomes enabled (don't actually delete unless verifying that specific flow is also desired — reuse the existing "TEST - da cancellare" order for this, never a real one).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/acquisti/ordini/\[id\]/page.tsx
git commit -m "feat(purchasing): redesign order detail page (two columns + status stepper)"
```

---

## Self-Review Notes

- Spec coverage: §2 (stepper header, two columns, sidebar contents, collapsible history, responsive stacking) → Task 2's JSX matches every element named in the design; §3 (stepper step mapping, CANCELLED exception) → Task 1's `STEPS`/`PARTIAL_STATUSES` tables match the design doc's mapping table exactly, including the COMPLETED-shares-Ricevuto note; §4 (components, no new API calls) → confirmed, Task 2 introduces zero new `api.*` calls.
- No placeholders: both tasks contain complete, exact code.
- Type consistency: `OrderStatusStepper`'s prop name (`logisticStatus`) and type (`LogisticStatus`) match exactly how Task 2 calls it (`<OrderStatusStepper logisticStatus={po.logisticStatus} />`).
