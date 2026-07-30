"use client";
import { AmazonOrder } from "@/lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtEur } from "@/lib/fmt";

interface Props {
  orders: AmazonOrder[];
  total: number;
  page: number;
  loading: boolean;
  onPageChange: (p: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  Shipped:   "text-accent-primary bg-accent-primary/10 border-accent-primary/20",
  Delivered: "text-accent-primary bg-accent-primary/10 border-accent-primary/20",
  Pending:   "text-accent-amber  bg-accent-amber/10  border-accent-amber/20",
  Unshipped: "text-accent-amber  bg-accent-amber/10  border-accent-amber/20",
  Canceled:  "text-accent-red    bg-accent-red/10    border-accent-red/20",
  Cancelled: "text-accent-red    bg-accent-red/10    border-accent-red/20",
};

const MP_FLAGS: Record<string, string> = { IT: "🇮🇹", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸" };

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

// Column config — hidden class must match the data cell below
const HEADERS: { label: string; cls: string }[] = [
  { label: "Order ID",   cls: ""                     },
  { label: "Mkt",        cls: ""                     },
  { label: "Status",     cls: ""                     },
  { label: "Unità",      cls: "hidden sm:table-cell" },
  { label: "Fatturato",  cls: ""                     },
  { label: "FBA/FBM",    cls: "hidden md:table-cell" },
  { label: "Paese",      cls: "hidden md:table-cell" },
  { label: "Data",       cls: ""                     },
  { label: "Settlement", cls: "hidden sm:table-cell" },
];

export default function AmazonOrdersTable({ orders, total, page, loading, onPageChange }: Props) {
  const LIMIT      = 50;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bg-border">
              {HEADERS.map((h) => (
                <th
                  key={h.label}
                  className={`px-3 sm:px-4 py-3 text-left text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap ${h.cls}`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-bg-border/50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {HEADERS.map((h, j) => (
                    <td key={j} className={`px-3 sm:px-4 py-3 ${h.cls}`}>
                      <div className="h-3 bg-bg-border rounded animate-pulse w-16" />
                    </td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-12 text-center text-zinc-600">
                  Nessun ordine trovato — esegui un backfill dal Sync Center
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const statusClass     = STATUS_COLORS[o.orderStatus] ?? "text-zinc-400 bg-zinc-800/50 border-zinc-700";
                const units           = o.items.reduce((s, i) => s + i.quantityOrdered, 0);
                const settlementShort = o.settlementId ? o.settlementId.slice(-8) : null;
                const depositDateStr  = o.depositDate
                  ? new Date(o.depositDate).toLocaleDateString("it-IT", {
                      day: "2-digit", month: "2-digit", year: "2-digit",
                    })
                  : null;

                return (
                  <tr key={o.id} className="table-row-hover transition-colors">
                    {/* Order ID: last 12 chars on xs, full on sm+ */}
                    <td className="px-3 sm:px-4 py-3 font-mono text-zinc-300">
                      <span className="sm:hidden">&hellip;{o.amazonOrderId.slice(-12)}</span>
                      <span className="hidden sm:inline">{o.amazonOrderId}</span>
                    </td>

                    {/* Marketplace: flag only on xs, flag + label on sm+ */}
                    <td className="px-3 sm:px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span>{MP_FLAGS[o.marketplace] ?? "🌐"}</span>
                        <span className="hidden sm:inline text-zinc-400">
                          Amazon.{o.marketplace.toLowerCase()}
                        </span>
                      </span>
                    </td>

                    {/* Status — always visible */}
                    <td className="px-3 sm:px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusClass}`}>
                        {o.orderStatus}
                      </span>
                    </td>

                    {/* Unità — hidden on xs */}
                    <td className="hidden sm:table-cell px-3 sm:px-4 py-3 text-zinc-300 tabular-nums">
                      {units}
                    </td>

                    {/* Fatturato — always visible */}
                    <td className="px-3 sm:px-4 py-3 text-white font-semibold tabular-nums">
                      {fmtEur(o.itemTotal)}
                    </td>

                    {/* FBA/FBM — hidden below md */}
                    <td className="hidden md:table-cell px-4 py-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs ${
                          o.fulfillmentChannel === "AFN"
                            ? "text-accent-blue bg-accent-blue/10"
                            : "text-zinc-400 bg-zinc-800"
                        }`}
                      >
                        {o.fulfillmentChannel === "AFN" ? "FBA" : "FBM"}
                      </span>
                    </td>

                    {/* Paese — hidden below md */}
                    <td className="hidden md:table-cell px-4 py-3 text-zinc-500">
                      {o.shipCountry ?? "—"}
                    </td>

                    {/* Data — always visible */}
                    <td className="px-3 sm:px-4 py-3 text-zinc-500">
                      {timeAgo(o.purchaseDate)}
                    </td>

                    {/* Settlement — hidden on xs */}
                    <td className="hidden sm:table-cell px-3 sm:px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {o.isPaid ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            title={o.settlementId ?? undefined}
                          >
                            ✓ Pagato
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-700/50 text-zinc-500 border border-zinc-700">
                            ⏳ In attesa
                          </span>
                        )}
                        {settlementShort && (
                          <span className="text-[9px] text-zinc-600 font-mono pl-1">
                            &hellip;{settlementShort}
                          </span>
                        )}
                        {depositDateStr && (
                          <span className="text-[9px] text-zinc-600 pl-1">{depositDateStr}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-bg-border text-xs text-zinc-500">
        <span>{total} ordini totali</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded border border-bg-border hover:border-accent-primary/30 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span>Pag. {page} / {Math.max(1, totalPages)}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded border border-bg-border hover:border-accent-primary/30 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
