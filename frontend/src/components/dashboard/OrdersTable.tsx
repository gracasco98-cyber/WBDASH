"use client";
import { Order } from "@/lib/api";
import { getMeta, formatEUR } from "@/lib/marketplaces";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  orders: Order[];
  total: number;
  page: number;
  setPage: (p: number) => void;
  loading?: boolean;
}

const FinancialBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    PAID:           { label: "Pagato",    color: "#6ee7b7", bg: "rgba(110,231,183,0.1)" },
    PENDING:        { label: "In attesa", color: "#fbbf24", bg: "rgba(251,191,36,0.1)"  },
    REFUNDED:       { label: "Rimborsato",color: "#f87171", bg: "rgba(248,113,113,0.1)" },
    PARTIALLY_REFUNDED: { label: "Part. rimb.", color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
    AUTHORIZED:     { label: "Autorizzato",color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    VOIDED:         { label: "Annullato", color: "#71717a", bg: "rgba(113,113,122,0.1)" },
  };
  const s = map[status] ?? { label: status, color: "#71717a", bg: "rgba(113,113,122,0.1)" };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
};

export default function OrdersTable({ orders, total, page, setPage, loading }: Props) {
  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-bg-border gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Ordini</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{total.toLocaleString("it-IT")} totali nel periodo</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-1.5 rounded-lg border border-bg-border text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-zinc-500 tabular-nums px-1">
            {page} / {totalPages || 1}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="p-1.5 rounded-lg border border-bg-border text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Ordine</th>
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Marketplace</th>
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Importo</th>
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">Netto</th>
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Stato</th>
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">Paese</th>
              <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Quando</th>
              <th className="w-8 sm:w-10" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-bg-border/50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className={`px-4 py-3 ${j === 1 || j === 6 ? "hidden sm:table-cell" : j === 3 || j === 5 ? "hidden md:table-cell" : ""}`}>
                      <div className="h-4 rounded bg-white/5 animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-zinc-600">
                  Nessun ordine nel periodo selezionato
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const meta = getMeta(order.marketplaceDetected);
                const isNew = Date.now() - new Date(order.createdAt).getTime() < 5 * 60 * 1000;
                return (
                  <tr
                    key={order.id}
                    className="border-b border-bg-border/40 table-row-hover transition-colors"
                    style={isNew ? { background: "rgba(110,231,183,0.03)" } : {}}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isNew && (
                          <span className="live-dot w-1.5 h-1.5 rounded-full bg-accent-primary flex-shrink-0" />
                        )}
                        <span className="font-mono text-xs text-zinc-200">{order.orderName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
                        style={{ color: meta.color, background: meta.bg }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white font-medium">
                      {formatEUR(order.totalAmount)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-300 hidden md:table-cell">
                      {formatEUR(order.netAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <FinancialBadge status={order.financialStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 hidden md:table-cell">
                      {order.customerCountry ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap hidden sm:table-cell">
                      {formatDistanceToNow(new Date(order.createdAt), { locale: it, addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${encodeURIComponent(order.shopifyOrderId)}`}
                        className="text-zinc-600 hover:text-accent-primary transition-colors"
                      >
                        <ExternalLink size={13} />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
