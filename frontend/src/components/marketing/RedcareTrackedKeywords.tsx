"use client";
import { useEffect, useMemo, useState } from "react";
import { api, type MarketingKeywordWatch, type MarketingKeywordSnapshot, type RedcareMarket } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChevronDown, ChevronUp, Trash2, RefreshCw, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { PositionBadge } from "./PositionBadge";
import { PositionSparkline } from "./PositionSparkline";
import { fmtEur } from "@/lib/fmt";

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

// Fetches each watch's position history once per product group (30 days),
// shared by both the always-visible sparkline/delta cells and the
// expandable combined chart — one fetch per watch, never duplicated across
// the two views.
function useGroupHistory(group: ProductGroup): Record<string, MarketingKeywordSnapshot[]> | null {
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
    // `group` is rebuilt every render, so keying off it directly would
    // refetch on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchIdsKey]);

  return series;
}

// Position change vs. the previous check — real, derived from the watch's
// own history (mirrors the rank-change arrow in keyword-research tools). A
// lower position number is better, so a decrease shows as an improvement.
function PositionDelta({ snapshots }: { snapshots: MarketingKeywordSnapshot[] | undefined }) {
  const positioned = (snapshots ?? []).filter(
    (s): s is MarketingKeywordSnapshot & { position: number } => s.position !== null
  );
  if (positioned.length < 2) return null;
  const current = positioned[positioned.length - 1].position;
  const previous = positioned[positioned.length - 2].position;
  const delta = previous - current;
  if (delta === 0) return <span className="text-zinc-600 text-[10px]">=</span>;
  const improved = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] ${improved ? "text-emerald-400" : "text-red-400"}`}>
      {improved ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(delta)}
    </span>
  );
}

function ProductChart({
  group, series,
}: {
  group: ProductGroup;
  series: Record<string, MarketingKeywordSnapshot[]> | null;
}) {
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

function ProductGroupRow({
  group, isOpen, onToggle, onRemove, onReload, setError,
}: {
  group: ProductGroup;
  isOpen: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
  onReload: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const series = useGroupHistory(group);
  const best = bestPosition(group.watches);

  // Refresh this product's position on demand — scoped server-side to just
  // its watches (POST /watches/check-now), unlike the global daily job.
  // Stops the click from bubbling to the header's expand/collapse toggle.
  const checkNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setChecking(true);
    setError(null);
    try {
      await api.marketingRedcare.checkNow({ market: group.market as RedcareMarket, ean: group.ean });
      await onReload();
    } catch {
      setError("Impossibile aggiornare la posizione in questo momento.");
    } finally {
      setChecking(false);
    }
  };

  // Add another keyword to this already-tracked product without going back
  // to Cerebro search — same POST /watches the search results' "Traccia"
  // buttons use, scoped to this product's market/ean/isOwn.
  const addKeyword = async () => {
    const keyword = newKeyword.trim();
    if (!keyword) return;
    setAdding(true);
    setError(null);
    try {
      await api.marketingRedcare.createWatch({
        market: group.market as RedcareMarket, ean: group.ean, keyword, label: group.label, isOwn: group.isOwn,
      });
      setNewKeyword("");
      await onReload();
    } catch {
      setError("Impossibile aggiungere la keyword in questo momento.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="border border-bg-border rounded-lg">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm ${group.isOwn ? "text-accent-primary" : "text-zinc-300"}`}>{group.label}</span>
          <span className="text-[11px] text-zinc-500">{group.market}</span>
          <span className="text-[11px] text-zinc-600">{group.watches.length} keyword</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={checkNow}
            disabled={checking}
            aria-label={`Aggiorna posizione ${group.label}`}
            className="text-zinc-500 hover:text-accent-primary disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
          </button>
          <PositionBadge position={best} />
          {isOpen ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
        </div>
      </div>

      <div className="overflow-x-auto px-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-600 text-[10px] uppercase">
              <th className="py-1 pr-3 font-normal">Keyword</th>
              <th className="py-1 pr-3 font-normal">Posizione</th>
              <th className="py-1 pr-3 font-normal">Var.</th>
              <th className="py-1 pr-3 font-normal">Trend</th>
              <th className="py-1 pr-3 font-normal">Prezzo</th>
              <th className="py-1 pr-3" />
            </tr>
          </thead>
          <tbody>
            {group.watches.map((w) => (
              <tr key={w.id} className="border-t border-bg-border/60">
                <td className="py-1.5 pr-3 text-zinc-400">{w.keyword}</td>
                <td className="py-1.5 pr-3"><PositionBadge position={foundPosition(w)} /></td>
                <td className="py-1.5 pr-3"><PositionDelta snapshots={series?.[w.id]} /></td>
                <td className="py-1.5 pr-3"><PositionSparkline snapshots={series?.[w.id] ?? []} /></td>
                <td className="py-1.5 pr-3 text-zinc-400 tabular-nums">
                  {w.latestSnapshot?.price != null ? fmtEur(w.latestSnapshot.price) : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  <button
                    onClick={() => onRemove(w.id)}
                    aria-label={`Rimuovi ${w.keyword}`}
                    className="text-zinc-600 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
        <input
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addKeyword()}
          placeholder="Nuova parola chiave"
          className="flex-1 bg-bg-elevated border border-bg-border rounded-lg px-2 py-1 text-xs text-white placeholder:text-zinc-600"
        />
        <button
          onClick={addKeyword}
          disabled={adding || !newKeyword.trim()}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20 disabled:opacity-50 whitespace-nowrap"
        >
          <Plus size={11} /> Aggiungi keyword
        </button>
      </div>

      {isOpen && (
        <div data-testid="product-chart-panel" className="border-t border-bg-border px-3 py-3">
          <ProductChart group={group} series={series} />
        </div>
      )}
    </div>
  );
}

export default function RedcareTrackedKeywords({ refreshKey }: Props) {
  const [watches, setWatches] = useState<MarketingKeywordWatch[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

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
  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.label.toLowerCase().includes(q) || g.ean.toLowerCase().includes(q));
  }, [groups, filter]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-white">Prodotti monitorati</h3>
        {groups.length > 0 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtra per nome o EAN…"
            className="w-56 bg-bg-elevated border border-bg-border rounded-lg px-2 py-1 text-xs text-white placeholder:text-zinc-600"
          />
        )}
      </div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {watches.length > 0 && <SummaryTiles watches={watches} />}
      {groups.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Nessun prodotto monitorato — traccia un risultato dalla ricerca qui sopra, o aggiungine uno manualmente.
        </p>
      ) : filteredGroups.length === 0 ? (
        <p className="text-sm text-zinc-600">Nessun prodotto corrisponde al filtro.</p>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const key = `${group.market}::${group.ean}`;
            return (
              <ProductGroupRow
                key={key}
                group={group}
                isOpen={expanded === key}
                onToggle={() => setExpanded(expanded === key ? null : key)}
                onRemove={remove}
                onReload={load}
                setError={setError}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
