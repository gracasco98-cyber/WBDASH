"use client";
import { useEffect, useMemo, useState } from "react";
import { api, type MarketingKeywordWatch, type MarketingKeywordSnapshot } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface Props {
  refreshKey: number;
}

// Grouped by product (market+ean) rather than by keyword: a product tracked
// on several keywords is one row that expands to its keyword list, instead
// of the same product scattered across separate keyword rows — this is the
// "pick a product, manage its keywords" flow the flat keyword-first layout
// couldn't support.
interface ProductGroup {
  market: string;
  ean: string;
  label: string;
  isOwn: boolean;
  watches: MarketingKeywordWatch[]; // one per keyword tracked for this product
}

function productLabel(watches: MarketingKeywordWatch[]): string {
  return watches.find((w) => w.label)?.label ?? watches[0].ean;
}

function groupByProduct(watches: MarketingKeywordWatch[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const w of watches) {
    const key = `${w.market}::${w.ean}`;
    const group = map.get(key) ?? { market: w.market, ean: w.ean, label: "", isOwn: w.isOwn, watches: [] };
    group.watches.push(w);
    map.set(key, group);
  }
  for (const group of map.values()) group.label = productLabel(group.watches);
  return Array.from(map.values());
}

function foundPosition(w: MarketingKeywordWatch): number | null {
  return w.latestSnapshot?.found ? w.latestSnapshot.position : null;
}

function bestPosition(watches: MarketingKeywordWatch[]): number | null {
  const positions = watches.map(foundPosition).filter((p): p is number => p !== null);
  return positions.length ? Math.min(...positions) : null;
}

const LINE_COLORS = ["#6ee7b7", "#fbbf24", "#f472b6", "#93c5fd", "#c4b5fd"];

function ProductChart({ group }: { group: ProductGroup }) {
  const [series, setSeries] = useState<Record<string, MarketingKeywordSnapshot[]> | null>(null);
  const watchIdsKey = group.watches.map((w) => w.id).join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        group.watches.map(async (w) => [w.id, (await api.marketingRedcare.watchHistory(w.id, 30)).snapshots] as const)
      );
      if (!cancelled) setSeries(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // Depend on the stable set of watch ids, not the `group` object identity —
    // `group` is rebuilt every render (memoized only per watch-list change),
    // so keying off it directly would refetch on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchIdsKey]);

  if (!series) return <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">Caricamento storico…</div>;

  const dates = Array.from(new Set(Object.values(series).flat().map((s) => s.checkedAt.slice(0, 10)))).sort();
  const chartData = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const w of group.watches) {
      const snap = series[w.id]?.find((s) => s.checkedAt.slice(0, 10) === date);
      row[w.id] = snap?.position ?? null;
    }
    return row;
  });

  if (chartData.length === 0) {
    return <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">Nessuno storico ancora — torna dopo il prossimo controllo giornaliero</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis reversed tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(_value, _entry, index) => group.watches[index as number].keyword} />
        {group.watches.map((w, i) => (
          <Line key={w.id} dataKey={w.id} name={w.id} stroke={LINE_COLORS[i % LINE_COLORS.length]} dot={{ r: 2 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function SummaryTiles({ watches }: { watches: MarketingKeywordWatch[] }) {
  const productCount = new Set(watches.map((w) => `${w.market}::${w.ean}`)).size;
  const keywordCount = watches.length;
  const positions = watches.map(foundPosition).filter((p): p is number => p !== null);
  const avgPosition = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  const lastChecked = watches
    .map((w) => w.latestSnapshot?.checkedAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const tiles: { label: string; value: string }[] = [
    { label: "Prodotti monitorati", value: String(productCount) },
    { label: "Keyword monitorate", value: String(keywordCount) },
    { label: "Posizione media", value: avgPosition !== null ? `#${avgPosition.toFixed(1)}` : "—" },
    {
      label: "Ultimo controllo",
      value: lastChecked
        ? new Date(lastChecked).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {tiles.map((t) => (
        <div key={t.label} className="bg-bg-elevated border border-bg-border rounded-lg p-3">
          <div className="text-[11px] text-zinc-500 mb-1">{t.label}</div>
          <div className="text-lg font-semibold text-white tabular-nums" data-testid={`tile-${t.label}`}>
            {t.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RedcareTrackedKeywords({ refreshKey }: Props) {
  const [watches, setWatches] = useState<MarketingKeywordWatch[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const { watches: list } = await api.marketingRedcare.listWatches();
      setWatches(list);
      setError(null);
    } catch {
      setError("Impossibile caricare i prodotti monitorati in questo momento.");
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const remove = async (id: string) => {
    try {
      await api.marketingRedcare.deleteWatch(id);
      await load();
    } catch {
      setError("Impossibile rimuovere questa keyword in questo momento.");
    }
  };

  const groups = useMemo(() => groupByProduct(watches), [watches]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Prodotti monitorati</h3>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {watches.length > 0 && <SummaryTiles watches={watches} />}
      {groups.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Nessun prodotto monitorato — traccia un risultato dalla ricerca qui sopra, o aggiungine uno manualmente.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = `${group.market}::${group.ean}`;
            const isOpen = expanded === key;
            const best = bestPosition(group.watches);
            return (
              <div key={key} className="border border-bg-border rounded-lg">
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${group.isOwn ? "text-accent-primary" : "text-zinc-300"}`}>{group.label}</span>
                    <span className="text-[11px] text-zinc-500">{group.market}</span>
                    <span className="text-[11px] text-zinc-600">{group.watches.length} keyword</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-400 tabular-nums text-sm">{best !== null ? `#${best}` : "non in classifica"}</span>
                    {isOpen ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
                  </div>
                </button>
                <div className="px-3 pb-2.5 space-y-1">
                  {group.watches.map((w) => (
                    <div key={w.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">{w.keyword}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 tabular-nums">
                          {w.latestSnapshot?.found ? `#${w.latestSnapshot.position}` : "non in classifica"}
                        </span>
                        <button
                          onClick={() => remove(w.id)}
                          aria-label={`Rimuovi ${w.keyword}`}
                          className="text-zinc-600 hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {isOpen && (
                  <div className="border-t border-bg-border px-3 py-3">
                    <ProductChart group={group} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
