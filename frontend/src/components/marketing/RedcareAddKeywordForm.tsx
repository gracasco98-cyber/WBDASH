"use client";
import { useState } from "react";
import { api, type RedcareMarket } from "@/lib/api";
import { Plus } from "lucide-react";

interface Props {
  onAdded: () => void;
}

// Complements RedcareKeywordSearch: that component can only track a row that
// appears in a keyword's live top-30 results, so a product ranked lower (or
// not yet checked at all) can never be added from there. This form writes
// the watch directly — the same POST /watches the search results' "Traccia"
// buttons use — and the daily job populates its position on the next run,
// same as any other watch.
export default function RedcareAddKeywordForm({ onAdded }: Props) {
  const [market, setMarket] = useState<RedcareMarket>("IT");
  const [ean, setEan] = useState("");
  const [label, setLabel] = useState("");
  const [keyword, setKeyword] = useState("");
  const [isOwn, setIsOwn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!ean.trim() && !!keyword.trim() && !saving;

  const handleAdd = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await api.marketingRedcare.createWatch({
        market,
        ean: ean.trim(),
        keyword: keyword.trim(),
        label: label.trim() || undefined,
        isOwn,
      });
      setEan("");
      setLabel("");
      setKeyword("");
      onAdded();
    } catch {
      setError("Impossibile aggiungere la keyword da monitorare in questo momento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-1">Aggiungi manualmente</h3>
      <p className="text-xs text-zinc-500 mb-4">
        Aggiungi un EAN e una keyword da monitorare anche se il prodotto non compare nella ricerca live qui sopra
        (es. posizionato oltre i primi 30 risultati). La posizione viene popolata dal controllo giornaliero.
      </p>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as RedcareMarket)}
          className="bg-bg-elevated border border-bg-border rounded-lg px-2 py-2 text-sm text-white"
        >
          <option value="IT">🇮🇹 IT</option>
          <option value="DE">🇩🇪 DE</option>
        </select>
        <input
          value={ean}
          onChange={(e) => setEan(e.target.value)}
          placeholder="EAN o codice prodotto"
          className="flex-1 min-w-[140px] bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nome prodotto (facoltativo)"
          className="flex-1 min-w-[160px] bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Parola chiave"
          className="flex-1 min-w-[160px] bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 whitespace-nowrap">
          <input type="checkbox" checked={isOwn} onChange={(e) => setIsOwn(e.target.checked)} />
          Mio prodotto
        </label>
        <button
          onClick={handleAdd}
          disabled={!canSubmit}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-primary/10 text-accent-primary border border-accent-primary/20 disabled:opacity-50"
        >
          <Plus size={14} /> Aggiungi
        </button>
      </div>
    </div>
  );
}
