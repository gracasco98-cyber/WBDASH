"use client";
import { useState } from "react";
import RedcareKeywordSearch from "@/components/marketing/RedcareKeywordSearch";
import RedcareTrackedKeywords from "@/components/marketing/RedcareTrackedKeywords";

export default function RedcareKeywordBiPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Redcare — Keyword BI</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Posizione organica per keyword su redcare.it / shop-apotheke.com, con storico per i tuoi prodotti e i competitor che tracci.
        </p>
      </div>
      <RedcareKeywordSearch onTracked={() => setRefreshKey((k) => k + 1)} />
      <RedcareTrackedKeywords refreshKey={refreshKey} />
    </div>
  );
}
