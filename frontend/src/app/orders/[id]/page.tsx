"use client";
import { useEffect, useState } from "react";
import { api, Order } from "@/lib/api";
import { getMeta, formatEUR } from "@/lib/marketplaces";
import Link from "next/link";
import { ArrowLeft, Tag, Info, Zap, Globe } from "lucide-react";

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-bg-border">
        <span className="text-accent-primary">{icon}</span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-bg-border/40 last:border-0">
      <span className="text-xs text-zinc-500 flex-shrink-0 w-44">{label}</span>
      <span className={`text-xs text-right ${mono ? "font-mono text-accent-primary" : "text-zinc-200"} ${!value ? "text-zinc-600" : ""}`}>
        {value ?? "null"}
      </span>
    </div>
  );
}

export default function OrderPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const id = decodeURIComponent(params.id);

  useEffect(() => {
    api.order(id).then(setOrder).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-accent-primary/30 border-t-accent-primary animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500">Ordine non trovato</p>
        <Link href="/" className="text-accent-primary text-sm hover:underline">← Torna alla dashboard</Link>
      </div>
    );
  }

  const meta = getMeta(order.marketplaceDetected);

  // Extract numeric ID from GID
  const shopifyNumericId = order.shopifyOrderId.split("/").pop();

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="border-b border-bg-border px-6 py-4 flex items-center gap-4 sticky top-0 bg-bg-base/95 backdrop-blur-sm z-40">
        <Link href="/" className="text-zinc-500 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-white font-mono">{order.orderName}</span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ color: meta.color, background: meta.bg }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {new Date(order.createdAt).toLocaleString("it-IT")}
          </p>
        </div>
        <div className="ml-auto">
          <a
            href={`https://admin.shopify.com/store/your-store/orders/${shopifyNumericId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-blue hover:underline flex items-center gap-1"
          >
            Apri in Shopify ↗
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4 animate-in">
        {/* Detection result — hero card */}
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: meta.color + "40", background: meta.bg }}
        >
          <div className="flex items-center gap-3 mb-3">
            <Zap size={16} style={{ color: meta.color }} />
            <span className="text-sm font-semibold text-white">Marketplace rilevato</span>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="text-2xl font-bold"
              style={{ color: meta.color }}
            >
              {meta.label}
            </div>
            <div className="flex-1">
              <div className="text-xs text-zinc-400 font-mono bg-bg-card/60 rounded-lg px-3 py-2 leading-relaxed">
                {order.marketplaceDetectionReason ?? "Nessuna motivazione disponibile"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Financials */}
          <Section title="Dati Finanziari" icon={<Info size={14} />}>
            <Row label="Fatturato lordo" value={formatEUR(order.totalAmount)} />
            <Row label="Netto (dopo rimborsi)" value={formatEUR(order.netAmount)} />
            <Row label="Rimborsi" value={formatEUR(order.refundedAmount)} />
            <Row label="Stato pagamento" value={order.financialStatus} />
            <Row label="Stato evasione" value={order.fulfillmentStatus} />
            <Row label="Valuta" value={order.currency} />
          </Section>

          {/* Source data used for detection */}
          <Section title="Dati sorgente Shopify" icon={<Globe size={14} />}>
            <Row label="sourceName" value={order.sourceName} mono />
            <Row label="channelDisplayName" value={order.channelDisplayName} mono />
            <Row label="Paese cliente" value={order.customerCountry} />
            <Row label="shopifyOrderId" value={order.shopifyOrderId} mono />
            <Row label="Sincronizzato" value={new Date(order.createdAt).toLocaleString("it-IT")} />
          </Section>
        </div>

        {/* Tags */}
        <Section title={`Tag Shopify (${order.rawTags.length})`} icon={<Tag size={14} />}>
          {order.rawTags.length === 0 ? (
            <p className="text-zinc-600 text-sm">Nessun tag presente</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {order.rawTags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono border border-bg-border bg-bg-base text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}
