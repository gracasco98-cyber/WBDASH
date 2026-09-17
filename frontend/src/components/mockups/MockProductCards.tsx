"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Package } from "lucide-react";

const products = [
  {
    name: "Collagenaid 120",
    channel: "Amazon.it · B0C0LL120",
    units: "47 pz",
    revenue: "1.284,20 €",
    profit: "128,73 €",
    margin: "24,8%",
    details: [
      ["Resi", "1 · 2,1%"], ["Promo", "−34,20 €"], ["Ads", "−112,40 €"],
      ["Fee marketplace", "−192,63 €"], ["COGS", "−423,00 €"], ["IVA", "−231,16 €"],
      ["Profitto lordo", "241,13 €"], ["Payout stimato", "835,81 €"], ["ROI", "30,4%"],
      ["ACOS reale", "8,8%"], ["Prezzo medio", "27,32 €"], ["BSR", "#1.284"],
      ["Stock", "184 pz"], ["SKU", "COLL-120-IT"],
    ],
  },
  {
    name: "Biotina 360",
    channel: "Amazon.it · B0BIOT360",
    units: "30 pz",
    revenue: "834,40 €",
    profit: "83,44 €",
    margin: "21,6%",
    details: [
      ["Resi", "0 · 0%"], ["Promo", "−18,00 €"], ["Ads", "−76,80 €"],
      ["Fee marketplace", "−125,16 €"], ["COGS", "−270,00 €"], ["IVA", "−150,48 €"],
      ["Profitto lordo", "160,24 €"], ["Payout stimato", "541,24 €"], ["ROI", "30,9%"],
      ["ACOS reale", "9,2%"], ["Prezzo medio", "27,81 €"], ["BSR", "#2.046"],
      ["Stock", "96 pz"], ["SKU", "BIO-360-IT"],
    ],
  },
  {
    name: "Soleil 80",
    channel: "Amazon.de · B0SOLEIL80",
    units: "26 pz",
    revenue: "702,60 €",
    profit: "100,58 €",
    margin: "27,2%",
    details: [
      ["Resi", "1 · 3,8%"], ["Promo", "−12,60 €"], ["Ads", "−54,10 €"],
      ["Fee marketplace", "−105,39 €"], ["COGS", "−221,00 €"], ["IVA", "−112,20 €"],
      ["Profitto lordo", "154,68 €"], ["Payout stimato", "451,91 €"], ["ROI", "45,5%"],
      ["ACOS reale", "7,7%"], ["Prezzo medio", "27,02 €"], ["BSR", "#3.112"],
      ["Stock", "71 pz"], ["SKU", "SOL-80-DE"],
    ],
  },
];

export default function MockProductCards() {
  const [expanded, setExpanded] = useState(products[0].name);

  return (
    <div className="grid gap-2">
      {products.map((product) => {
        const isOpen = expanded === product.name;
        return (
          <article key={product.name} className="overflow-hidden rounded-[11px] border border-[#dfe6ee] bg-white">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? "" : product.name)}
              className="flex w-full items-center gap-2 p-2.5 text-left"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eaf8f2] text-[#168464]">
                <Package size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[10px]">{product.name}</b>
                <small className="mt-0.5 block truncate text-[8px] text-[#8490a0]">{product.channel}</small>
              </div>
              {isOpen ? <ChevronDown size={14} className="text-[#168464]" /> : <ChevronRight size={14} className="text-[#8a96a7]" />}
            </button>

            <dl className="grid grid-cols-2 border-t border-[#edf1f5]">
              {[
                ["Unità vendute", product.units], ["Ricavi", product.revenue],
                ["Profitto netto", product.profit], ["Margine", product.margin],
                ...(isOpen ? product.details : []),
              ].map(([label, value]) => (
                <div key={label} className="border-b border-r border-[#edf1f5] px-2.5 py-2">
                  <dt className="text-[7px] font-bold uppercase tracking-[.06em] text-[#8390a1]">{label}</dt>
                  <dd className={`mt-1 text-[10px] font-bold tabular-nums ${label.includes("Profitto") || label === "Margine" ? "text-[#168464]" : "text-[#172236]"}`}>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
