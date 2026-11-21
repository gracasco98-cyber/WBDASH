"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes, FileSpreadsheet, Image as ImageIcon, Loader2, Megaphone, Package, Search } from "lucide-react";
import { api, type LaunchCatalogProduct } from "@/lib/api";

export default function AmazonMarketingPage() {
  const [products, setProducts] = useState<LaunchCatalogProduct[]>([]); const [query, setQuery] = useState("");
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.launches.catalog().then(async (result) => {
      setProducts(result.products);
      const asins = [...new Set(result.products.flatMap((product) => product.identifiers.map((item) => item.asin).filter((asin): asin is string => !!asin)))];
      if (asins.length) setImages(await api.amazon.catalogImages(asins.slice(0, 60)));
    }).catch(() => setError("Impossibile caricare il catalogo prodotti")).finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => products.filter((product) => `${product.name} ${product.brand ?? ""} ${product.identifiers.map((item) => `${item.asin} ${item.sku}`).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const amazonProducts = products.filter((product) => product.identifiers.some((item) => item.asin));

  return <div className="min-h-screen bg-[#f3f6fb] text-slate-700">
    <header className="border-b border-slate-200 bg-white px-5 py-6 lg:px-10"><div className="mx-auto flex max-w-[1500px] flex-wrap items-start justify-between gap-5"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#8a6508]"><Megaphone size={15}/>Amazon Marketing</div><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Area prodotto</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Uno spazio operativo unico per comunicazione, lancio, piano editoriale, immagini e performance giornaliere.</p></div><div className="grid grid-cols-3 gap-2"><Stat value={amazonProducts.length} label="Prodotti"/><Stat value={products.reduce((sum, product) => sum + product.identifiers.filter((item) => item.asin).length, 0)} label="ASIN"/><Stat value={5} label="Aree"/></div></div></header>
    <main className="mx-auto max-w-[1500px] p-5 lg:p-8">
      <div className="grid gap-3 md:grid-cols-3"><Feature icon={FileSpreadsheet} title="Lancio e performance" text="Excel editabile con vendite, unità PPC, sessioni e conversione importate per ASIN."/><Feature icon={Megaphone} title="Contenuti e PED" text="Copy Amazon, keyword, calendario editoriale e approvazioni nello stesso workspace."/><Feature icon={ImageIcon} title="Asset organizzati" text="Cartelle prodotto in stile Drive per listing, A+ Content, social e packaging."/></div>
      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5"><div><h2 className="text-base font-bold text-slate-900">Seleziona un prodotto</h2><p className="mt-1 text-xs text-slate-500">Apri il workspace collegato al master data e ai suoi ASIN</p></div><div className="relative w-full sm:w-80"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca prodotto, ASIN o SKU…" className="h-10 w-full rounded-full border border-slate-300 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-100"/></div></div>
        {loading ? <div className="flex items-center justify-center py-24 text-xs text-slate-500"><Loader2 size={16} className="mr-2 animate-spin"/>Carico i prodotti…</div> : error ? <div className="py-24 text-center text-xs text-red-600">{error}</div> : <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map((product) => { const primary = product.identifiers.find((item) => item.asin); return <Link key={product.id} href={`/amazon/marketing/products/${product.id}`} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg"><span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">{primary?.asin && images[primary.asin] ? <img src={images[primary.asin] ?? ""} alt="" className="h-full w-full object-contain p-1.5"/> : <Package size={23} className="text-slate-400"/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{product.name}</span><span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{product.brand ?? "Brand non assegnato"}</span><span className="mt-3 flex items-center gap-2 text-[10px] text-slate-500"><Boxes size={12}/><span className="font-mono">{primary?.asin ?? "ASIN non collegato"}</span><span>·</span><span>{primary?.marketplace ?? "—"}</span></span></span><ArrowRight size={17} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-amber-700"/></Link>; })}{!filtered.length && <div className="col-span-full py-20 text-center text-xs text-slate-400">Nessun prodotto trovato.</div>}</div>}
      </section>
    </main>
  </div>;
}

function Stat({ value, label }: { value: number; label: string }) { return <div className="min-w-20 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center"><div className="text-xl font-extrabold text-slate-900">{value}</div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</div></div>; }
function Feature({ icon: Icon, title, text }: { icon: typeof FileSpreadsheet; title: string; text: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f3f0e7] text-[#8a6508]"><Icon size={18}/></span><h2 className="mt-4 text-sm font-bold text-slate-800">{title}</h2><p className="mt-1.5 text-xs leading-relaxed text-slate-500">{text}</p></div>; }
