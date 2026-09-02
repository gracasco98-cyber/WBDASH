"use client";
import { useMemo, useState } from "react";
import { api, type RedcareMarket, type RedcareSearchHit } from "@/lib/api";
import { Search, Plus, Star, ArrowUp, ArrowDown } from "lucide-react";
import { fmtEur } from "@/lib/fmt";
import { PositionBadge } from "./PositionBadge";

interface Props {
  onTracked: () => void;
}

type SortKey = "position" | "price" | "rating";
type SortDir = "asc" | "desc";

// Sensible default direction per column: position/price naturally start
// ascending (best first), rating naturally starts descending (best first).
const DEFAULT_DIR: Record<SortKey, SortDir> = { position: "asc", price: "asc", rating: "desc" };

function sortHits(hits: RedcareSearchHit[], key: SortKey, dir: SortDir): RedcareSearchHit[] {
  const withValue = hits.map((hit, i) => ({ hit, i, value: hit[key] }));
  withValue.sort((a, b) => {
    // Nulls always sort last, regardless of direction — a missing value is
    // never "the best" or "the worst" on a meaningful scale.
    if (a.value === null && b.value === null) return a.i - b.i;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    const cmp = a.value - b.value;
    return dir === "asc" ? cmp : -cmp;
  });
  return withValue.map((w) => w.hit);
}

function SortHeader({
  label, sortKey, active, dir, onSort,
}: {
  label: string; sortKey: SortKey; active: boolean; dir: SortDir; onSort: (k: SortKey) => void;
}) {
  return (
    <th className="py-1.5 pr-3">
      <button onClick={() => onSort(sortKey)} className="flex items-center gap-1 hover:text-zinc-300">
        {label}
        {active && (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}

export default function RedcareKeywordSearch({ onTracked }: Props) {
  const [market, setMarket] = useState<RedcareMarket>("IT");
  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<RedcareSearchHit[] | null>(null);
  const [nbHits, setNbHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingEan, setTrackingEan] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // The exact { market, keyword } that produced the currently displayed
  // `hits` — NOT the live `market`/`keyword` input state. If the user edits
  // the input or flips the market select after searching but before
  // re-running the search, `track()` and the results caption must still
  // refer to what was actually searched, not the unverified live values.
  const [searched, setSearched] = useState<{ market: RedcareMarket; keyword: string } | null>(null);

  const runSearch = async () => {
    const q = keyword.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.marketingRedcare.search(market, q);
      setHits(result.hits);
      setNbHits(result.nbHits);
      setSearched({ market, keyword: q });
      setSortKey("position");
      setSortDir("asc");
    } catch {
      setError("Impossibile recuperare i risultati da Redcare in questo momento.");
      setHits(null);
    } finally {
      setLoading(false);
    }
  };

  const track = async (hit: RedcareSearchHit, isOwn: boolean) => {
    if (!hit.ean || !searched) return;
    setTrackingEan(hit.ean);
    setError(null);
    try {
      await api.marketingRedcare.createWatch({
        market: searched.market, keyword: searched.keyword, ean: hit.ean,
        label: isOwn ? undefined : (hit.sellerName ?? undefined),
        isOwn,
      });
      onTracked();
    } catch {
      setError("Impossibile tracciare questo prodotto in questo momento.");
    } finally {
      setTrackingEan(null);
    }
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  };

  const sortedHits = useMemo(() => (hits ? sortHits(hits, sortKey, sortDir) : null), [hits, sortKey, sortDir]);

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-1">Cerebro — Ricerca keyword</h3>
      <p className="text-xs text-zinc-500 mb-4">
        Posizione organica reale e dati di mercato per una parola chiave su redcare.it / shop-apotheke.com.
      </p>
      <div className="flex items-center gap-2 mb-4">
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as RedcareMarket)}
          className="bg-bg-elevated border border-bg-border rounded-lg px-2 py-2 text-sm text-white"
        >
          <option value="IT">🇮🇹 IT — redcare.it</option>
          <option value="DE">🇩🇪 DE — shop-apotheke.com</option>
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Cerca una keyword (es. diosmina esperidina)"
          className="flex-1 bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
        <button
          onClick={runSearch}
          disabled={loading || !keyword.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-primary/10 text-accent-primary border border-accent-primary/20 disabled:opacity-50"
        >
          <Search size={14} /> Cerca
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {sortedHits && (
        <>
          <p className="text-xs text-zinc-500 mb-2">{nbHits} risultati per "{searched?.keyword ?? keyword}"</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 text-xs uppercase">
                  <SortHeader label="#" sortKey="position" active={sortKey === "position"} dir={sortDir} onSort={handleSort} />
                  <th className="py-1.5 pr-3">Prodotto</th>
                  <th className="py-1.5 pr-3">Categoria</th>
                  <th className="py-1.5 pr-3">Venditore</th>
                  <SortHeader label="Prezzo" sortKey="price" active={sortKey === "price"} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Rating" sortKey="rating" active={sortKey === "rating"} dir={sortDir} onSort={handleSort} />
                  <th className="py-1.5 pr-3">Stock</th>
                  <th className="py-1.5 pr-3">Segnale</th>
                  <th className="py-1.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {sortedHits.map((hit) => (
                  <tr key={`${hit.position}-${hit.ean ?? "no-ean"}`} className="border-t border-bg-border align-top">
                    <td className="py-1.5 pr-3"><PositionBadge position={hit.position} /></td>
                    <td className="py-1.5 pr-3">
                      <div className="text-white">{hit.productName ?? "—"}</div>
                      {hit.brand && <div className="text-[11px] text-zinc-500">{hit.brand}</div>}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-400 text-[11px] max-w-[180px]">{hit.category ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-zinc-400">
                      {hit.sellerName ?? "—"}
                      {hit.sellerCount != null && hit.sellerCount > 1 && (
                        <span className="text-[10px] text-zinc-600 ml-1">+{hit.sellerCount - 1} altri</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-400 tabular-nums">{hit.price != null ? fmtEur(hit.price) : "—"}</td>
                    <td className="py-1.5 pr-3 text-zinc-400">
                      {hit.rating != null ? (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Star size={11} className="text-amber-400 fill-amber-400" />
                          {hit.rating.toFixed(1)}
                          {hit.ratingCount != null && <span className="text-zinc-600">({hit.ratingCount})</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {hit.inStock === null ? (
                        <span className="text-zinc-600">—</span>
                      ) : hit.inStock ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">Disponibile</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Esaurito</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500">
                      {hit.promotedByReRanking ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">AI re-ranked</span>
                      ) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {hit.ean && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => track(hit, true)}
                            disabled={trackingEan === hit.ean}
                            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20 disabled:opacity-50"
                          >
                            <Plus size={11} /> Traccia (mio)
                          </button>
                          <button
                            onClick={() => track(hit, false)}
                            disabled={trackingEan === hit.ean}
                            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-zinc-700/30 text-zinc-300 border border-bg-border disabled:opacity-50"
                          >
                            <Plus size={11} /> Traccia (competitor)
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
