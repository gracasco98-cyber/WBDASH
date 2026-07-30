"use client";

import { AggregatedProduct, AggregatedProductsResponse } from "@/lib/api";
import { useState } from "react";

interface AggregatedProductsViewProps {
  data: AggregatedProductsResponse;
  loading: boolean;
  error: string | null;
  viewConfig: {
    primaryMetric: string;
    sortBy: string;
    sortDir: "asc" | "desc";
    visibleCols: string[];
  };
}

const metricLabels: Record<string, string> = {
  totalRevenue: "Vendite",
  totalOrders: "Ordini",
  totalUnits: "Unità",
  sales: "Vendite Lordi",
  promo: "Promo",
  percentRefunds: "% Resi",
  amazonFees: "Commissioni",
  costOfGoods: "Costo Merci",
  grossProfit: "Profitto Lordo",
  netProfit: "Profitto Netto",
  estimatedPayout: "Pagamento Stim.",
  expenses: "Spese",
  margin: "Margine",
  roi: "ROI",
  realAcos: "Real ACOS",
  sessionsDay: "Sessioni",
  unitSoldSessionPct: "Unità %",
  shippingCosts: "Costi Spedizione",
  totalRefunds: "Resi Totali",
  totalAdSpend: "Spesa Ads",
};

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "n/D";
  if (value === 0) return "€0";
  return `€${(value / 1000).toFixed(1)}k`;
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "n/D";
  return Math.round(value).toLocaleString("it-IT");
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "n/D";
  return `${value.toFixed(1)}%`;
};

const formatMetric = (value: any, metricId: string): string => {
  if (value === null || value === undefined) return "n/D";

  switch (metricId) {
    case "margin":
    case "percentRefunds":
    case "unitSoldSessionPct":
    case "realAcos":
      return formatPercent(value);
    case "totalRevenue":
    case "sales":
    case "promo":
    case "amazonFees":
    case "costOfGoods":
    case "grossProfit":
    case "netProfit":
    case "estimatedPayout":
    case "expenses":
    case "totalAdSpend":
    case "shippingCosts":
      return formatCurrency(value);
    default:
      return formatNumber(value);
  }
};

export function AggregatedProductsView({
  data,
  loading,
  error,
  viewConfig,
}: AggregatedProductsViewProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  if (loading) {
    return <div className="text-center py-8">Caricamento...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">Errore: {error}</div>;
  }

  const products = data.products || [];

  if (products.length === 0) {
    return <div className="text-center py-8">Nessun prodotto trovato</div>;
  }

  const toggleExpanded = (productId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const getProductId = (p: AggregatedProduct): string => {
    return `${p.asin || p.sku}-${p.imageUrl || ""}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      {/* Desktop View */}
      <div className="hidden md:block">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <th className="text-left p-3 font-bold text-gray-900" style={{ width: "35%" }}>Prodotto</th>
              <th className="text-right p-3 font-bold text-blue-600" style={{ width: "20%" }}>
                {metricLabels[viewConfig.primaryMetric] || "Vendite"}
              </th>
              <th className="text-right p-3 font-bold text-emerald-600" style={{ width: "15%" }}>Ordini</th>
              <th className="text-right p-3 font-bold text-purple-600" style={{ width: "15%" }}>Unità</th>
              {viewConfig.visibleCols.includes("margin") && (
                <th className="text-right p-3 font-bold text-gray-700" style={{ width: "15%" }}>Margine</th>
              )}
              <th className="text-left p-3 font-bold text-gray-900">Venduto su</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const productId = getProductId(product);
              const isExpanded = expandedRows[productId];

              return (
                <tbody key={productId}>
                  <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="p-3" style={{ width: "35%" }}>
                      <div className="flex items-start gap-3 min-w-0">
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.productTitle}
                            className="w-10 h-10 object-cover rounded flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate max-w-2xl line-clamp-2">
                            {product.productTitle}
                          </div>
                          {(product.asin || product.sku) && (
                            <div className="text-xs text-gray-500">
                              {product.asin && `ASIN: ${product.asin}`}
                              {product.asin && product.sku && " · "}
                              {product.sku && `SKU: ${product.sku}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right" style={{ width: "20%" }}>
                      <div className="text-base font-bold text-blue-600">
                        {formatMetric(
                          viewConfig.primaryMetric === "sales"
                            ? product.sales
                            : product.totalRevenue,
                          viewConfig.primaryMetric
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right" style={{ width: "15%" }}>
                      <div className="text-base font-bold text-emerald-600">
                        {formatNumber(product.totalOrders)}
                      </div>
                    </td>
                    <td className="p-3 text-right" style={{ width: "15%" }}>
                      <div className="text-base font-bold text-purple-600">
                        {formatNumber(product.totalUnits)}
                      </div>
                    </td>
                    {viewConfig.visibleCols.includes("margin") && (
                      <td className="p-3 text-right text-sm font-semibold text-gray-700" style={{ width: "15%" }}>
                        {formatMetric(product.margin, "margin")}
                      </td>
                    )}
                    <td className="p-3 text-left">
                      <button
                        onClick={() => toggleExpanded(productId)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {product.marketplaces.length} canale{product.marketplaces.length !== 1 ? "i" : ""}
                        {isExpanded ? " ▼" : " ▶"}
                      </button>
                      {isExpanded && (
                        <div className="mt-3 space-y-2 text-xs text-gray-600 bg-gray-50 p-3 rounded">
                          {product.marketplaces.map((mp, idx) => (
                            <div key={idx} className="border-l-2 border-blue-300 pl-3">
                              <div className="font-semibold text-gray-900">{mp.label}</div>
                              <div className="text-gray-600">
                                {formatCurrency(mp.revenue)} · {formatNumber(mp.orders)} ord. · {formatNumber(mp.units)} unità
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {products.map((product) => {
          const productId = getProductId(product);
          const isExpanded = expandedRows[productId];

          return (
            <div
              key={productId}
              className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start gap-3 mb-3">
                {product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt={product.productTitle}
                    className="w-14 h-14 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">{product.productTitle}</div>
                  {(product.asin || product.sku) && (
                    <div className="text-xs text-gray-500">
                      {product.asin && `ASIN: ${product.asin}`}
                      {product.asin && product.sku && " · "}
                      {product.sku && `SKU: ${product.sku}`}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3 bg-gray-50 p-3 rounded-lg">
                <div className="text-center">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Vendite</div>
                  <div className="text-lg font-bold text-blue-600 mt-1">
                    {formatMetric(product.totalRevenue, "totalRevenue")}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ordini</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">
                    {formatNumber(product.totalOrders)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Unità</div>
                  <div className="text-lg font-bold text-purple-600 mt-1">
                    {formatNumber(product.totalUnits)}
                  </div>
                </div>
              </div>

              <button
                onClick={() => toggleExpanded(productId)}
                className="w-full text-left text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline py-2 border-t border-gray-200"
              >
                Venduto su: {product.marketplaces.length} canale{product.marketplaces.length !== 1 ? "i" : ""}{" "}
                {isExpanded ? "▼" : "▶"}
              </button>

              {isExpanded && (
                <div className="mt-3 space-y-2 text-xs">
                  {product.marketplaces.map((mp, idx) => (
                    <div key={idx} className="bg-gray-50 p-3 rounded-lg border-l-2 border-blue-300">
                      <div className="font-semibold text-gray-900">{mp.label}</div>
                      <div className="text-gray-600 mt-1">
                        {formatCurrency(mp.revenue)} · {formatNumber(mp.orders)} ord. · {formatNumber(mp.units)} unità
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination/Load More */}
      {data.total > data.limit && (
        <div className="mt-4 text-center text-sm text-gray-600">
          Visualizzati {data.limit} di {data.total} prodotti
        </div>
      )}
    </div>
  );
}
