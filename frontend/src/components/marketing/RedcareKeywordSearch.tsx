"use client";
import { useState } from "react";
import { api, type RedcareMarket, type RedcareSearchHit } from "@/lib/api";
import { Search, Plus } from "lucide-react";
import { fmtEur } from "@/lib/fmt";

interface Props {
  onTracked: () => void;
}

export default function RedcareKeywordSearch({ onTracked }: Props) {
  const [market, setMarket] = useState<RedcareMarket>("IT");
  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<RedcareSearchHit[] | null>(null);
  const [nbHits, setNbHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingEan, setTrackingEan] = useState<string | null>(null);
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

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Cerca posizione per keyword</h3>
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

      {hits && (
        <>
          <p className="text-xs text-zinc-500 mb-2">{nbHits} risultati per "{searched?.keyword ?? keyword}"</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 text-xs uppercase">
                  <th className="py-1.5 pr-3">#</th>
                  <th className="py-1.5 pr-3">Prodotto</th>
                  <th className="py-1.5 pr-3">Venditore</th>
                  <th className="py-1.5 pr-3">Prezzo</th>
                  <th className="py-1.5 pr-3">Segnale</th>
                  <th className="py-1.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr key={`${hit.position}-${hit.ean ?? "no-ean"}`} className="border-t border-bg-border">
                    <td className="py-1.5 pr-3 text-zinc-400">{hit.position}</td>
                    <td className="py-1.5 pr-3 text-white">{hit.productName ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-zinc-400">{hit.sellerName ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-zinc-400">{hit.price != null ? fmtEur(hit.price) : "—"}</td>
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
