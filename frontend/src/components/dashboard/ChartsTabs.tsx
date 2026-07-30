"use client";
import { useState, useMemo } from "react";
import { Clock, CalendarDays, PieChart as PieChartIcon } from "lucide-react";
import SalesTabs from "./SalesTabs";
import MarketplaceDonutContent from "./MarketplaceDonutContent";
import { api, Summary, TimePoint, AmazonSummary } from "@/lib/api";

type Tab = "canali" | "giornaliero" | "mensile";

interface Props {
  data: TimePoint[];
  bucket: "minute" | "hour";
  multiDay?: boolean;
  amazonData?: TimePoint[];
  onHourClick?: (hour: string) => void;
  marketplace: string;
  isAmazonMp: boolean;
  amazonMpCode: string | null;
  filter: string;
  from: string;
  to: string;
  // For donut chart
  shopifyData: [string, { count: number; revenue: number; net: number }][];
  shopifyTotal: number;
  amazonByMarketplace?: Record<string, { revenue: number; orders: number; units?: number }>;
  amazonTotalRevenue?: number;
  onMarketplaceSelect: (mp: string) => void;
  loading?: boolean;
}

export default function ChartsTabs({
  data,
  bucket,
  multiDay = false,
  amazonData,
  onHourClick,
  marketplace,
  isAmazonMp,
  amazonMpCode,
  filter,
  from,
  to,
  shopifyData,
  shopifyTotal,
  amazonByMarketplace,
  amazonTotalRevenue = 0,
  onMarketplaceSelect,
  loading = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("canali");

  const tabs = [
    { key: "canali" as const, label: "Canali di vendita", icon: <PieChartIcon size={13} /> },
    { key: "giornaliero" as const, label: "Andamento Giornaliero", icon: <Clock size={13} /> },
    { key: "mensile" as const, label: "Andamento Mensile", icon: <CalendarDays size={13} /> },
  ];

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card h-full min-h-[340px] flex flex-col overflow-hidden">
      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--color-bg-border)" }}>
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-5 py-3 text-xs font-semibold transition-all"
            style={{
              color: tab === key ? "#6ee7b7" : "#71717a",
              borderBottom: tab === key ? "2px solid #6ee7b7" : "2px solid transparent",
              background: tab === key ? "rgba(110,231,183,0.06)" : "transparent",
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Canali di vendita tab ─────────────────────────────────────────── */}
      {tab === "canali" && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <MarketplaceDonutContent
            shopifyData={shopifyData}
            shopifyTotal={shopifyTotal}
            amazonByMarketplace={amazonByMarketplace}
            amazonTotalRevenue={amazonTotalRevenue}
            marketplace={marketplace}
            onSelect={onMarketplaceSelect}
            loading={loading}
          />
        </div>
      )}

      {/* ── Giornaliero tab ───────────────────────────────────────────────── */}
      {tab === "giornaliero" && (
        <div className="flex-1 overflow-hidden">
          <SalesTabs
            data={data}
            bucket={bucket}
            multiDay={multiDay}
            amazonData={amazonData}
            onHourClick={onHourClick}
            marketplace={marketplace}
            isAmazonMp={isAmazonMp}
            amazonMpCode={amazonMpCode}
            filter={filter}
            from={from}
            to={to}
            hideCard
            hideTabBar
          />
        </div>
      )}

      {/* ── Mensile tab ───────────────────────────────────────────────────── */}
      {tab === "mensile" && (
        <div className="flex-1 overflow-hidden">
          <SalesTabs
            data={data}
            bucket={bucket}
            multiDay={multiDay}
            amazonData={amazonData}
            onHourClick={onHourClick}
            marketplace={marketplace}
            isAmazonMp={isAmazonMp}
            amazonMpCode={amazonMpCode}
            filter={filter}
            from={from}
            to={to}
            hideCard
            hideTabBar
            monthlyTab
          />
        </div>
      )}
    </div>
  );
}
