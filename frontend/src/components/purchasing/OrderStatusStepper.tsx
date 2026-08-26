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
