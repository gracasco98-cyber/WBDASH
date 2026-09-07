"use client";

import { useState } from "react";
import {
  Grid2X2,
  Menu,
  ShoppingBag,
  Sparkles,
  Target,
  Warehouse,
} from "lucide-react";

const money = (value: string) => value;

export default function MobileDashboardMockup() {
  const [variant, setVariant] = useState<"tiles" | "focus">("tiles");
  return (
    <main className="min-h-screen bg-[#eef2f6] px-4 py-6 text-[#172236] md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#168464]">
              WBDASH · anteprima mobile
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Template da approvare
            </h1>
            <p className="mt-1 text-sm text-[#68768b]">
              Prototipo isolato: la dashboard attuale non viene modificata.
            </p>
          </div>
          <div className="flex rounded-xl border border-[#dbe3ec] bg-white p-1 shadow-sm">
            <button
              onClick={() => setVariant("tiles")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${variant === "tiles" ? "bg-[#eaf8f2] text-[#168464]" : "text-[#748196]"}`}
            >
              A · Tiles
            </button>
            <button
              onClick={() => setVariant("focus")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${variant === "focus" ? "bg-[#eaf8f2] text-[#168464]" : "text-[#748196]"}`}
            >
              B · Focus
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-[390px] overflow-hidden rounded-[32px] border-[8px] border-[#182338] bg-[#f8fafc] shadow-[0_20px_45px_rgba(20,33,61,.22)]">
            <div className="h-5 bg-[#182338]" />
            <header className="flex h-16 items-center gap-2.5 border-b border-[#e1e7ee] bg-white px-4">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[#f3a51a] text-lg font-black text-white">
                Q
              </div>
              <div>
                <b className="block text-sm">WBDASH</b>
                <small className="block text-[8px] font-bold tracking-[.12em] text-[#8a96a7]">
                  COMMERCE OS
                </small>
              </div>
              <Menu className="ml-auto text-[#78869a]" size={21} />
            </header>

            <div className="space-y-4 px-3.5 pb-20 pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[17px] font-bold">
                    {variant === "tiles" ? "Dashboard" : "Buongiorno, Graziano"}
                  </h2>
                  <p className="mt-1 text-[10px] text-[#758297]">
                    {variant === "tiles"
                      ? "Martedì 1 settembre 2026"
                      : "Il tuo riepilogo operativo"}
                  </p>
                </div>
                <span className="rounded-full bg-[#eaf8f2] px-2 py-1 text-[9px] font-semibold text-[#168464]">
                  ● Sync 2 min
                </span>
              </div>

              <div className="flex gap-1.5 overflow-hidden">
                <span className="whitespace-nowrap rounded-lg border border-[#b9e5d3] bg-[#eaf8f2] px-2.5 py-2 text-[10px] font-bold text-[#107a5b]">
                  Oggi · 1 set
                </span>
                <span className="whitespace-nowrap rounded-lg border border-[#dce4ec] bg-white px-2.5 py-2 text-[10px] text-[#58677c]">
                  Amazon.it⌄
                </span>
                <span className="whitespace-nowrap rounded-lg border border-[#dce4ec] bg-white px-2.5 py-2 text-[10px] text-[#58677c]">
                  Tutti⌄
                </span>
              </div>

              <section className="rounded-[13px] border border-[#dbe4ed] border-t-[3px] border-t-[#2d7bd3] bg-white p-3 shadow-[0_4px_14px_rgba(20,33,61,.05)]">
                <div className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[#2d7bd3]">
                  {variant === "tiles"
                    ? "Ricavi netti · oggi"
                    : "Performance di oggi"}
                </div>
                <strong className="my-1 block text-[29px] tracking-[-.05em]">
                  {money("3.537,35 €")}
                </strong>
                <span className="rounded-full bg-[#eaf8f2] px-2 py-1 text-[10px] font-semibold text-[#168464]">
                  ↗ +8,4%
                </span>
                <div className="mt-3 flex justify-between text-[10px] text-[#637188]">
                  <span>275 ordini</span>
                  <span>302 unità</span>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label:
                      variant === "tiles" ? "Profitto netto" : "Margine netto",
                    value: variant === "tiles" ? "878,20 €" : "24,8%",
                    color: "text-[#168464]",
                  },
                  {
                    label: variant === "tiles" ? "Margine" : "Ordini",
                    value: variant === "tiles" ? "24,8%" : "275",
                    color: "text-[#172236]",
                  },
                  {
                    label: variant === "tiles" ? "Ads" : "Payout",
                    value: variant === "tiles" ? "−379,88 €" : "2.412,91 €",
                    color: "text-[#cb8900]",
                  },
                  {
                    label: variant === "tiles" ? "Resi" : "Costi totali",
                    value: variant === "tiles" ? "71,20 €" : "−2.381 €",
                    color: "text-[#d24e55]",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[11px] border border-[#e1e7ee] bg-white p-2.5"
                  >
                    <small className="block text-[8px] uppercase tracking-[.08em] text-[#78869a]">
                      {item.label}
                    </small>
                    <b className={`mt-1 block text-base ${item.color}`}>
                      {item.value}
                    </b>
                  </div>
                ))}
              </div>

              {variant === "focus" && (
                <div className="rounded-[11px] border border-[#f0d79c] bg-[#fff7e6] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#9c6c00]">
                    <Sparkles size={14} /> Insight operativo
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-[#705d35]">
                    Collagenaid guida il risultato con 128,73 € di profitto. 3
                    prodotti hanno margine sotto il 20%.
                  </p>
                </div>
              )}

              <section>
                <h3 className="mb-2 text-[11px] font-extrabold">
                  {variant === "tiles"
                    ? "Confronto periodi"
                    : "Confronta periodi"}
                </h3>
                {variant === "tiles" ? (
                  <div className="flex gap-2 overflow-hidden">
                    {[
                      ["Ieri", "14.276 €", "1.230 unità"],
                      ["Mese", "3.537 €", "302 unità"],
                      ["Forecast", "468.400 €", "+5,6%"],
                    ].map(([label, value, note]) => (
                      <div
                        key={label}
                        className="min-w-[118px] rounded-[10px] border border-[#dfe6ee] bg-white p-2.5"
                      >
                        <b className="block text-[9px]">{label}</b>
                        <strong className="mt-1.5 block text-sm">
                          {value}
                        </strong>
                        <span className="text-[9px] text-[#748196]">
                          {note}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[10px] border border-[#dfe6ee] bg-white">
                    {[
                      ["Oggi", "3.537,35 €"],
                      ["Ieri · 31 agosto", "14.276,82 €"],
                      ["Ultimi 7 giorni", "52.890,10 €"],
                      ["Mese in corso", "3.537,35 €"],
                    ].map(([label, value], index) => (
                      <div
                        key={label}
                        className="flex items-center justify-between border-b border-[#edf1f5] px-3 py-2.5 text-[10px] last:border-0"
                      >
                        <span>{label}</span>
                        <b className={index === 0 ? "text-[#168464]" : ""}>
                          {value}　{index === 0 ? "⌃" : "›"}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-[11px] font-extrabold">
                  {variant === "tiles"
                    ? "Prodotti principali"
                    : "Azioni rapide"}
                </h3>
                <div className="grid gap-2">
                  {(variant === "tiles"
                    ? [
                        ["Collagenaid 120", "47 unità · Amazon.it", "128,73 €"],
                        ["Biotina 360", "30 unità · Amazon.it", "83,44 €"],
                        ["Soleil 80", "26 unità · Amazon.de", "100,58 €"],
                      ]
                    : [
                        ["Aggiorna dati", "Ultimo sync 2 min fa", "↻"],
                        ["Esporta riepilogo", "CSV · PDF", "↓"],
                      ]
                  ).map(([name, note, value]) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 rounded-[10px] border border-[#e1e7ee] bg-white p-2.5"
                    >
                      <div className="grid h-8 w-7 place-items-center rounded-md bg-[#eaf8f2] text-[9px] font-extrabold text-[#168464]">
                        {variant === "tiles" ? "WB" : value}
                      </div>
                      <div className="min-w-0 flex-1">
                        <b className="block text-[10px]">{name}</b>
                        <small className="mt-0.5 block text-[9px] text-[#8490a0]">
                          {note}
                        </small>
                      </div>
                      <strong
                        className={
                          variant === "tiles"
                            ? "text-[11px] text-[#168464]"
                            : "text-[#748196]"
                        }
                      >
                        {variant === "tiles" ? value : "›"}
                      </strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <nav className="flex h-14 items-center justify-around border-t border-[#dfe6ee] bg-white text-[#8490a0]">
              {[
                [Grid2X2, "Dashboard"],
                [ShoppingBag, "Ordini"],
                [Warehouse, "Magazzino"],
                [Menu, "Altro"],
              ].map(([Icon, label], index) => (
                <div
                  key={label as string}
                  className={`flex flex-col items-center gap-0.5 text-[8px] ${index === 0 ? "font-bold text-[#168464]" : ""}`}
                >
                  <Icon size={16} />
                  <span>{label as string}</span>
                </div>
              ))}
            </nav>
          </div>
        </div>

        <div className="mx-auto mt-6 flex max-w-[390px] items-center justify-center gap-2 text-center text-[11px] text-[#68768b]">
          <Target size={13} className="text-[#168464]" /> Questa è solo
          un’anteprima: nessun dato reale viene modificato.
        </div>
      </div>
    </main>
  );
}
