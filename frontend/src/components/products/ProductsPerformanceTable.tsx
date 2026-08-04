"use client";
import { useState, Fragment } from "react";
import type { ProductPerformanceGroup, ProductPerformanceRow } from "@/lib/api";
import { api } from "@/lib/api";

export type GroupBy = "marketplace" | "product";

interface Props {
  groups: ProductPerformanceGroup[];
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  onRenamed: () => void;
  onMoved: () => void;
}

const MARKETPLACE_LABEL: Record<string, string> = {
  IT: "Amazon.it", DE: "Amazon.de", FR: "Amazon.fr", ES: "Amazon.es",
  UK: "Amazon.co.uk", PL: "Amazon.pl", NL: "Amazon.nl", SE: "Amazon.se", BE: "Amazon.com.be",
};

const fmtEur = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${(n * 100).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
const dash = (v: number | null, fmt: (n: number) => string) => (v === null ? "—" : fmt(v));

interface RowEntry {
  key: string;
  label: string;
  metrics: ProductPerformanceRow;
  children?: { key: string; label: string; metrics: ProductPerformanceRow }[];
}

function buildRowsByProduct(groups: ProductPerformanceGroup[]): RowEntry[] {
  return groups.map((g) => ({
    key: g.product.id,
    label: g.product.name,
    metrics: g.aggregate,
    children: g.rows.map((r) => ({
      key: `${g.product.id}-${r.marketplace}-${r.asin}`,
      label: MARKETPLACE_LABEL[r.marketplace] ?? r.marketplace,
      metrics: r,
    })),
  }));
}

function buildRowsByMarketplace(groups: ProductPerformanceGroup[]): RowEntry[] {
  const byMarketplace = new Map<string, { rows: ProductPerformanceRow[]; labels: Map<string, string> }>();
  for (const g of groups) {
    for (const r of g.rows) {
      const entry = byMarketplace.get(r.marketplace) ?? { rows: [] as ProductPerformanceRow[], labels: new Map<string, string>() };
      entry.rows.push(r);
      entry.labels.set(`${g.product.id}::${r.asin}`, g.product.name);
      byMarketplace.set(r.marketplace, entry);
    }
  }
  return [...byMarketplace.entries()].map(([mp, { rows, labels }]) => {
    const sum = rows.reduce(
      (acc, r) => ({
        units: acc.units + r.units, sales: acc.sales + r.sales, promo: acc.promo + r.promo,
        refundsAmount: acc.refundsAmount + r.refundsAmount, refundsCount: acc.refundsCount + r.refundsCount,
        amazonFees: acc.amazonFees + r.amazonFees, cogs: acc.cogs + r.cogs, stock: acc.stock + r.stock,
        grossProfit: acc.grossProfit + r.grossProfit, netProfit: acc.netProfit + r.netProfit,
        estimatedPayout: acc.estimatedPayout + r.estimatedPayout,
        adsSpend: r.adsSpend !== null ? (acc.adsSpend ?? 0) + r.adsSpend : acc.adsSpend,
      }),
      { units: 0, sales: 0, promo: 0, refundsAmount: 0, refundsCount: 0, amazonFees: 0, cogs: 0, stock: 0, grossProfit: 0, netProfit: 0, estimatedPayout: 0, adsSpend: null as number | null }
    );
    const aggregate: ProductPerformanceRow = {
      identifierId: "", asin: "", marketplace: mp, sku: null, bsr: null, hasRealFees: rows.every((r) => r.hasRealFees),
      refundPct: sum.sales > 0 ? sum.refundsAmount / sum.sales : 0,
      realAcos: sum.adsSpend !== null && sum.sales > 0 ? sum.adsSpend / sum.sales : null,
      margin: sum.sales > 0 ? sum.netProfit / sum.sales : 0,
      roi: sum.cogs > 0 ? sum.netProfit / sum.cogs : 0,
      avgSellingPrice: sum.units > 0 ? sum.sales / sum.units : 0,
      ...sum,
    };
    return {
      key: mp,
      label: MARKETPLACE_LABEL[mp] ?? mp,
      metrics: aggregate,
      children: rows.map((r) => {
        const productName = [...labels.entries()].find(([k]) => k.endsWith(`::${r.asin}`))?.[1] ?? r.asin;
        return { key: `${mp}-${r.asin}`, label: productName, metrics: r };
      }),
    };
  });
}

function MetricCell({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "9px 10px" }}>{children}</td>;
}

export default function ProductsPerformanceTable({ groups, groupBy, onGroupByChange, onRenamed, onMoved }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [movingId, setMovingId] = useState<string | null>(null);
  const [targetProductId, setTargetProductId] = useState("");

  const rows = groupBy === "product" ? buildRowsByProduct(groups) : buildRowsByMarketplace(groups);

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const handleRename = async (productId: string, currentName: string) => {
    const name = window.prompt("Nuovo nome prodotto:", currentName);
    if (!name || name === currentName) return;
    await api.productPerformance.rename(productId, name);
    onRenamed();
  };

  const handleMove = async (identifierId: string) => {
    if (!targetProductId) return;
    await api.productPerformance.moveIdentifier(identifierId, targetProductId);
    setMovingId(null);
    setTargetProductId("");
    onMoved();
  };

  return (
    <div style={{ background: "#f4f5f7", borderRadius: 10, border: "1px solid #ddd", color: "#1a1a1a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
        <span style={{ fontSize: 12, color: "#6b7280" }}>▤ Prodotti</span>
        <label style={{ fontSize: 12, color: "#374151" }}>
          Raggruppa per{" "}
          <select
            aria-label="Raggruppa per"
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
          >
            <option value="marketplace">Marketplace</option>
            <option value="product">Prodotto</option>
          </select>
        </label>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: "0 0 8px 8px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr style={{ color: "#6b7280", textAlign: "left", background: "#fafafa", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: "9px 10px" }}>Marketplace / Prodotto</th>
              <th style={{ padding: "9px 10px" }}>Unità</th>
              <th style={{ padding: "9px 10px" }}>Resi</th>
              <th style={{ padding: "9px 10px" }}>Ricavi</th>
              <th style={{ padding: "9px 10px" }}>Promo</th>
              <th style={{ padding: "9px 10px" }}>Ads</th>
              <th style={{ padding: "9px 10px" }}>% Resi</th>
              <th style={{ padding: "9px 10px" }}>Fee Amazon</th>
              <th style={{ padding: "9px 10px" }}>COGS</th>
              <th style={{ padding: "9px 10px" }}>Profitto lordo</th>
              <th style={{ padding: "9px 10px" }}>Profitto netto</th>
              <th style={{ padding: "9px 10px" }}>Payout stimato</th>
              <th style={{ padding: "9px 10px" }}>Margine</th>
              <th style={{ padding: "9px 10px" }}>ROI</th>
              <th style={{ padding: "9px 10px" }}>BSR</th>
              <th style={{ padding: "9px 10px" }}>Prezzo medio</th>
              <th style={{ padding: "9px 10px" }}>ACOS reale</th>
              <th style={{ padding: "9px 10px" }}>Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const isOpen = expanded.has(entry.key);
              const m = entry.metrics;
              return (
                <Fragment key={entry.key}>
                  <tr style={{ borderBottom: "1px solid #f0f0f1" }}>
                    <MetricCell>
                      <button
                        aria-label={`Espandi ${entry.label}`}
                        onClick={() => toggle(entry.key)}
                        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <span>{isOpen ? "▾" : "›"}</span> {entry.label}
                      </button>
                      {groupBy === "product" && (
                        <button
                          title="Rinomina"
                          onClick={() => handleRename(entry.key, entry.label)}
                          style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}
                        >
                          ✎
                        </button>
                      )}
                    </MetricCell>
                    <MetricCell>{m.units}</MetricCell>
                    <MetricCell>{fmtEur(m.refundsAmount)}</MetricCell>
                    <MetricCell>{fmtEur(m.sales)}</MetricCell>
                    <MetricCell>{fmtEur(m.promo)}</MetricCell>
                    <MetricCell>{dash(m.adsSpend, fmtEur)}</MetricCell>
                    <MetricCell>{fmtPct(m.refundPct)}</MetricCell>
                    <MetricCell>{fmtEur(m.amazonFees)}</MetricCell>
                    <MetricCell>{fmtEur(m.cogs)}</MetricCell>
                    <MetricCell>{fmtEur(m.grossProfit)}</MetricCell>
                    <MetricCell>{fmtEur(m.netProfit)}</MetricCell>
                    <MetricCell>{fmtEur(m.estimatedPayout)}</MetricCell>
                    <MetricCell>{fmtPct(m.margin)}</MetricCell>
                    <MetricCell>{fmtPct(m.roi)}</MetricCell>
                    <MetricCell>{dash(m.bsr, (n) => String(n))}</MetricCell>
                    <MetricCell>{fmtEur(m.avgSellingPrice)}</MetricCell>
                    <MetricCell>{dash(m.realAcos, fmtPct)}</MetricCell>
                    <MetricCell>{m.stock}</MetricCell>
                  </tr>
                  {isOpen && entry.children?.map((child) => (
                    <tr key={child.key} style={{ background: "#f9fafb" }}>
                      <MetricCell>
                        <span style={{ marginLeft: 20, color: "#6b7280" }}>
                          ↳ {child.label} — <span>{child.metrics.asin}</span>
                        </span>
                        {groupBy === "product" && (
                          <button
                            onClick={() => setMovingId(child.key)}
                            style={{ marginLeft: 8, fontSize: 10, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                          >
                            Sposta in un altro prodotto…
                          </button>
                        )}
                        {movingId === child.key && (
                          <span style={{ marginLeft: 8 }}>
                            <input
                              aria-label="ID prodotto destinazione"
                              value={targetProductId}
                              onChange={(e) => setTargetProductId(e.target.value)}
                              placeholder="ID prodotto destinazione"
                              style={{ fontSize: 10, width: 160 }}
                            />
                            <button onClick={() => handleMove(child.metrics.identifierId)} style={{ fontSize: 10, marginLeft: 4 }}>OK</button>
                          </span>
                        )}
                      </MetricCell>
                      <MetricCell>{child.metrics.units}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.refundsAmount)}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.sales)}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.promo)}</MetricCell>
                      <MetricCell>{dash(child.metrics.adsSpend, fmtEur)}</MetricCell>
                      <MetricCell>{fmtPct(child.metrics.refundPct)}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.amazonFees)}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.cogs)}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.grossProfit)}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.netProfit)}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.estimatedPayout)}</MetricCell>
                      <MetricCell>{fmtPct(child.metrics.margin)}</MetricCell>
                      <MetricCell>{fmtPct(child.metrics.roi)}</MetricCell>
                      <MetricCell>{dash(child.metrics.bsr, (n) => String(n))}</MetricCell>
                      <MetricCell>{fmtEur(child.metrics.avgSellingPrice)}</MetricCell>
                      <MetricCell>{dash(child.metrics.realAcos, fmtPct)}</MetricCell>
                      <MetricCell>{child.metrics.stock}</MetricCell>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
