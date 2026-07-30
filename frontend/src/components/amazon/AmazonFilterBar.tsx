"use client";

interface Props {
  filter: string;
  marketplace: string;
  onFilterChange: (f: string) => void;
  onMarketplaceChange: (m: string) => void;
  // Custom date range (optional â€” shown only when filter === "custom")
  from?: string;
  to?: string;
  onFromChange?: (v: string) => void;
  onToChange?: (v: string) => void;
}

const DATE_FILTERS = [
  { value: "today",     label: "Oggi"         },
  { value: "yesterday", label: "Ieri"         },
  { value: "last7",     label: "7 giorni"     },
  { value: "last30",    label: "30 giorni"    },
  { value: "last90",    label: "90 giorni"    },
  { value: "month",     label: "Questo mese"  },
  { value: "custom",    label: "Custom"       },
];

const AMAZON_MARKETPLACES = [
  { value: "all", label: "Tutti i marketplace" },
  // EU
  { value: "IT",  label: "ðŸ‡®ðŸ‡¹ Amazon.it"       },
  { value: "DE",  label: "ðŸ‡©ðŸ‡ª Amazon.de"       },
  { value: "FR",  label: "ðŸ‡«ðŸ‡· Amazon.fr"       },
  { value: "ES",  label: "ðŸ‡ªðŸ‡¸ Amazon.es"       },
  { value: "PL",  label: "ðŸ‡µðŸ‡± Amazon.pl"       },
  { value: "UK",  label: "ðŸ‡¬ðŸ‡§ Amazon.co.uk"    },
  // NA
  { value: "US",  label: "ðŸ‡ºðŸ‡¸ Amazon.com"      },
  { value: "CA",  label: "ðŸ‡¨ðŸ‡¦ Amazon.ca"       },
  { value: "MX",  label: "ðŸ‡²ðŸ‡½ Amazon.com.mx"   },
];

export default function AmazonFilterBar({
  filter, marketplace,
  onFilterChange, onMarketplaceChange,
  from = "", to = "",
  onFromChange, onToChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {/* Date pills */}
      <div className="flex items-center gap-0.5 bg-bg-card border border-bg-border rounded-lg p-1 overflow-x-auto scrollbar-hide shrink-0">
        {DATE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-md transition-all whitespace-nowrap ${
              filter === f.value
                ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs â€” only visible when filter === "custom" */}
      {filter === "custom" && onFromChange && onToChange && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => onFromChange(e.target.value)}
            className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs rounded-lg border border-bg-border bg-bg-card text-zinc-300 focus:outline-none focus:border-accent-primary/40"
          />
          <span className="text-zinc-600 text-xs">â†’</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => onToChange(e.target.value)}
            className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs rounded-lg border border-bg-border bg-bg-card text-zinc-300 focus:outline-none focus:border-accent-primary/40"
          />
        </div>
      )}

      {/* Marketplace select */}
      <select
        value={marketplace}
        onChange={(e) => onMarketplaceChange(e.target.value)}
        className="min-w-0 max-w-full w-full sm:w-auto bg-bg-card border border-bg-border text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-primary/40"
      >
        {AMAZON_MARKETPLACES.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </div>
  );
}
