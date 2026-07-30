"use client";
import { ArrowDown, ArrowUp, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { MetricId, ViewConfig, DEFAULT_CONFIG, METRIC_DEFS } from "./crossChannelTypes";
import { saveCfg } from "./crossChannelUtils";

interface SettingsPanelProps {
  cfg: ViewConfig;
  onChange: (c: ViewConfig) => void;
  onClose: () => void;
}

export function SettingsPanel({ cfg, onChange, onClose }: SettingsPanelProps) {
  const update = (patch: Partial<ViewConfig>) => {
    const next = { ...cfg, ...patch };
    onChange(next);
    saveCfg(next);
  };

  const toggleCol = (id: MetricId) => {
    const on = cfg.visibleCols.includes(id);
    if (on && cfg.visibleCols.length <= 1) return;
    if (on && id === cfg.primaryMetric) {
      const next = METRIC_DEFS.find(d => d.canPrimary && d.id !== id && cfg.visibleCols.includes(d.id));
      if (next) update({ primaryMetric: next.id, visibleCols: cfg.visibleCols.filter(c => c !== id) });
      return;
    }
    update({ visibleCols: on ? cfg.visibleCols.filter(c => c !== id) : [...cfg.visibleCols, id] });
  };

  const toggleSort = (id: MetricId) => {
    if (cfg.sortBy === id) update({ sortDir: cfg.sortDir === "desc" ? "asc" : "desc" });
    else update({ sortBy: id, sortDir: "desc" });
  };

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white border border-zinc-200 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-200">
        <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
          <SlidersHorizontal size={11} className="text-accent-primary" />
          Personalizza vista
        </span>
        <button onClick={onClose} className="p-0.5 text-gray-600 hover:text-gray-900 transition-colors">
          <X size={12} />
        </button>
      </div>

      {/* Primary metric */}
      <div className="px-3.5 py-2.5 border-b border-zinc-100">
        <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">
          Metrica principale <span className="text-gray-500">(numero grande)</span>
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {METRIC_DEFS.filter(d => d.canPrimary).map(d => {
            const available = cfg.visibleCols.includes(d.id);
            const active = cfg.primaryMetric === d.id;
            return (
              <button
                key={d.id}
                disabled={!available}
                onClick={() => update({ primaryMetric: d.id })}
                title={!available ? "Attiva questa colonna prima" : ""}
                className={`px-2.5 py-1 text-[10px] rounded-lg border transition-all ${
                  active
                    ? "bg-accent-primary/10 text-accent-primary border-accent-primary/30 font-semibold"
                    : available
                    ? "text-gray-600 border-zinc-200 hover:text-gray-900 hover:border-zinc-300"
                    : "text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sort */}
      <div className="px-3.5 py-2.5 border-b border-zinc-100">
        <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Ordina per</p>
        <div className="flex gap-1.5 flex-wrap">
          {METRIC_DEFS.map(d => (
            <button
              key={d.id}
              onClick={() => toggleSort(d.id)}
              className={`flex items-center gap-0.5 px-2 py-1 text-[10px] rounded-lg border transition-all ${
                cfg.sortBy === d.id
                  ? "bg-accent-primary/10 text-accent-primary border-accent-primary/30"
                  : "text-gray-600 border-zinc-200 hover:text-gray-900 hover:border-zinc-300"
              }`}
            >
              {cfg.sortBy === d.id && (
                cfg.sortDir === "desc"
                  ? <ArrowDown size={8} className="shrink-0" />
                  : <ArrowUp size={8} className="shrink-0" />
              )}
              {d.short}
            </button>
          ))}
        </div>
      </div>

      {/* Group By Product */}
      <div className="px-3.5 py-2.5 border-b border-zinc-100">
        <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Aggregazione</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={cfg.groupByProduct || false}
            onChange={(e) => update({ groupByProduct: e.target.checked })}
            className="accent-accent-primary w-3.5 h-3.5 shrink-0"
          />
          <span>Raggruppa per Prodotto</span>
        </label>
        <p className="text-[9px] text-gray-500 mt-1">Somma metriche per EAN/SKU/Nome</p>
      </div>

      {/* Visible columns */}
      <div className="px-3.5 py-2.5">
        <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Colonne visibili</p>
        <div className="grid grid-cols-2 gap-1">
          {METRIC_DEFS.map(d => {
            const checked = cfg.visibleCols.includes(d.id);
            return (
              <label
                key={d.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors ${
                  checked ? "bg-gray-50 text-gray-900" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCol(d.id)}
                  className="accent-accent-primary w-3 h-3 shrink-0"
                />
                <span className="text-[10px]">{d.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="px-3.5 pb-2.5 flex justify-end border-t border-zinc-100 pt-2">
        <button
          onClick={() => { onChange(DEFAULT_CONFIG); saveCfg(DEFAULT_CONFIG); }}
          className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-900 transition-colors"
        >
          <RotateCcw size={9} />
          Ripristina default
        </button>
      </div>
    </div>
  );
}
