"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  ChevronDown,
} from "lucide-react";

// ── Nav config ────────────────────────────────────────────────────────────────

const MARKETPLACE_ITEMS = [
  { href: "/products", label: "Prodotti & Performance" },
];

const AMAZON_ITEMS = [
  { href: "/amazon",           label: "Overview"    },
  { href: "/amazon/pl",        label: "P&L"         },
  { href: "/amazon/products",  label: "Prodotti"    },
  { href: "/amazon/cogs",      label: "COGS"        },
  { href: "/amazon/inventory", label: "Magazzino"   },
  { href: "/amazon/orders",    label: "Ordini"      },
  { href: "/amazon/ppc",       label: "PPC / Ads"   },
  { href: "/amazon/payments",  label: "Pagamenti"   },
  { href: "/amazon/sync",      label: "Sync Center" },
  { href: "/amazon/analytics", label: "Analytics"   },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function GlobalSidebar() {
  const pathname = usePathname();

  const [mpOpen, setMpOpen]  = useState(false);
  const [amzOpen, setAmzOpen] = useState(false);

  const isDashboard   = pathname === "/";
  const isMarketplace = pathname.startsWith("/products");
  const isAmazon      = pathname.startsWith("/amazon");

  return (
    <aside
      className="
        hidden md:flex flex-col w-52 shrink-0
        sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto
        border-r border-bg-border
        bg-bg-card
      "
    >
      <nav className="flex flex-col gap-0.5 py-3 px-2">

        {/* ── Dashboard ── */}
        <Link
          href="/"
          className={`
            flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium
            transition-all border
            ${isDashboard
              ? "bg-accent-primary/12 border-accent-primary/25 text-accent-primary"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
            }
          `}
        >
          <LayoutDashboard size={15} className="shrink-0" />
          Dashboard
        </Link>

        {/* ── Marketplace group ── */}
        <div className="mt-2">
          <button
            onClick={() => setMpOpen(v => !v)}
            className={`
              w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg
              text-xs font-semibold uppercase tracking-widest transition-colors
              ${isMarketplace
                ? "text-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
              }
            `}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag size={13} className="shrink-0" />
              Marketplace
            </span>
            <ChevronDown
              size={12}
              className={`shrink-0 transition-transform duration-200 ${mpOpen ? "" : "-rotate-90"}`}
            />
          </button>

          {mpOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-zinc-800 flex flex-col gap-0.5">
              {MARKETPLACE_ITEMS.map(item => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      px-2.5 py-1.5 rounded-lg text-sm transition-all border
                      ${active
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-medium"
                        : "border-transparent text-zinc-500 hover:text-white hover:bg-white/5"
                      }
                    `}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Amazon group ── */}
        <div className="mt-2">
          <button
            onClick={() => setAmzOpen(v => !v)}
            className={`
              w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg
              text-xs font-semibold uppercase tracking-widest transition-colors
              ${isAmazon
                ? "text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
              }
            `}
          >
            <span className="flex items-center gap-2">
              <Package size={13} className="shrink-0" />
              Amazon
            </span>
            <ChevronDown
              size={12}
              className={`shrink-0 transition-transform duration-200 ${amzOpen ? "" : "-rotate-90"}`}
            />
          </button>

          {amzOpen && (
            <div className="mt-0.5 ml-3 pl-3 border-l border-zinc-800 flex flex-col gap-0.5">
              {AMAZON_ITEMS.map(item => {
                const active = item.href === "/amazon"
                  ? pathname === "/amazon"
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      px-2.5 py-1.5 rounded-lg text-sm transition-all border
                      ${active
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400 font-medium"
                        : "border-transparent text-zinc-500 hover:text-white hover:bg-white/5"
                      }
                    `}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
