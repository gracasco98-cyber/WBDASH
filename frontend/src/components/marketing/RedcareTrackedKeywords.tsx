"use client";
import { useEffect, useMemo, useState } from "react";
import { api, type MarketingKeywordWatch, type MarketingKeywordSnapshot } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface Props {
  refreshKey: number;
}

interface KeywordGroup {
  market: string;
  keyword: string;
  watches: MarketingKeywordWatch[];
}

function groupByKeyword(watches: MarketingKeywordWatch[]): KeywordGroup[] {
  const map = new Map<string, KeywordGroup>();
  for (const w of watches) {
    const key = `${w.market}::${w.keyword}`;
    const group = map.get(key) ?? { market: w.market, keyword: w.keyword, watches: [] };
    group.watches.push(w);
    map.set(key, group);
  }
  return Array.from(map.values());
}

function watchLabel(w: MarketingKeywordWatch): string {
  if (w.isOwn) return "Il tuo prodotto";
  return w.label ?? "Competitor";
}

const LINE_COLORS = ["#6ee7b7", "#fbbf24", "#f472b6", "#93c5fd", "#c4b5fd"];

function KeywordChart({ group }: { group: KeywordGroup }) {
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
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(_value, _entry, index) => watchLabel(group.watches[index as number])} />
        {group.watches.map((w, i) => (
          <Line key={w.id} dataKey={w.id} name={w.id} stroke={LINE_COLORS[i % LINE_COLORS.length]} dot={{ r: 2 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
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
      setError("Impossibile caricare le keyword monitorate in questo momento.");
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

  const groups = useMemo(() => groupByKeyword(watches), [watches]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Keyword monitorate</h3>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {groups.length === 0 ? (
        <p className="text-sm text-zinc-600">Nessuna keyword monitorata — traccia un risultato dalla ricerca qui sopra.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = `${group.market}::${group.keyword}`;
            const isOpen = expanded === key;
            return (
              <div key={key} className="border border-bg-border rounded-lg">
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                >
                  <div>
                    <span className="text-sm text-white">{group.keyword}</span>
                    <span className="text-[11px] text-zinc-500 ml-2">{group.market}</span>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
                </button>
                <div className="px-3 pb-2.5 space-y-1">
                  {group.watches.map((w) => (
                    <div key={w.id} className="flex items-center justify-between text-sm">
                      <span className={w.isOwn ? "text-accent-primary" : "text-zinc-400"}>{watchLabel(w)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 tabular-nums">
                          {w.latestSnapshot?.found ? `#${w.latestSnapshot.position}` : "non in classifica"}
                        </span>
                        <button onClick={() => remove(w.id)} className="text-zinc-600 hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {isOpen && (
                  <div className="border-t border-bg-border px-3 py-3">
                    <KeywordChart group={group} />
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
