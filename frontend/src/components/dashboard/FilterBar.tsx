"use client";
import ProductSearchBar from "./ProductSearchBar";
import { MARKETPLACE_META } from "@/lib/marketplaces";
import { SelectedProduct } from "./ProductBIOverview";

// Amazon channel keys used in the marketplace filter
export const AMAZON_CHANNEL_MAP: Record<string, string> = {
  AMAZON_IT: "IT",
  AMAZON_DE: "DE",
  AMAZON_FR: "FR",
  AMAZON_ES: "ES",
  AMAZON_PL: "PL",
  AMAZON_UK: "UK",
  AMAZON_US: "US",
  AMAZON_CA: "CA",
  AMAZON_MX: "MX",
};
export const isAmazonChannel  = (mp: string) => mp in AMAZON_CHANNEL_MAP;
export const amazonChannelCode = (mp: string) => AMAZON_CHANNEL_MAP[mp] ?? null;

interface Props {
  marketplace: string; setMarketplace: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  selectedProduct?: SelectedProduct | null;
  onSelectProduct?: (product: SelectedProduct | null) => void;
}

const STATUSES = [
  { value: "all",       label: "Tutti gli stati" },
  { value: "PAID",      label: "Pagati"          },
  { value: "PENDING",   label: "In attesa"       },
  { value: "REFUNDED",  label: "Rimborsati"      },
];

export default function FilterBar({
  marketplace, setMarketplace, status, setStatus,
  selectedProduct, onSelectProduct,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 w-full max-w-full flex-1">
      {/* Marketplace select — grouped: Amazon / Sito */}
      <select
        value={marketplace}
        onChange={(e) => setMarketplace(e.target.value)}
        className="min-w-0 max-w-full w-full sm:w-auto px-3 py-1.5 text-xs rounded-lg border border-bg-border bg-bg-card text-zinc-300 focus:outline-none focus:border-accent-primary/40"
      >
        <option value="all">Tutti i marketplace</option>

        <optgroup label="Amazon EU">
          <option value="AMAZON_IT">Amazon.it</option>
          <option value="AMAZON_DE">Amazon.de</option>
          <option value="AMAZON_FR">Amazon.fr</option>
          <option value="AMAZON_ES">Amazon.es</option>
          <option value="AMAZON_PL">Amazon.pl</option>
          <option value="AMAZON_UK">Amazon.co.uk</option>
        </optgroup>

        <optgroup label="Amazon NA">
          <option value="AMAZON_US">Amazon.com</option>
          <option value="AMAZON_CA">Amazon.ca</option>
          <option value="AMAZON_MX">Amazon.com.mx</option>
        </optgroup>

        <optgroup label="Sito / Altri">
          {Object.entries(MARKETPLACE_META)
            .filter(([k]) => k !== "UNCLASSIFIED")
            .map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
        </optgroup>
      </select>

      {/* Status select */}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="min-w-0 max-w-full w-full sm:w-auto px-3 py-1.5 text-xs rounded-lg border border-bg-border bg-bg-card text-zinc-300 focus:outline-none focus:border-accent-primary/40"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Product search — positioned on the right */}
      {onSelectProduct && (
        <div className="ml-auto min-w-0">
          <ProductSearchBar
            onSelect={onSelectProduct}
            selected={selectedProduct ?? null}
          />
        </div>
      )}
    </div>
  );
}
