"use client";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SyncStatus from "@/components/dashboard/SyncStatus";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";

const AMAZON_TABS = [
  { href: "/amazon",            emoji: "📊", label: "Overview"     },
  { href: "/amazon/pl",         emoji: "📈", label: "P&L"          },
  { href: "/amazon/products",   emoji: "📦", label: "Prodotti"     },
  { href: "/amazon/cogs",       emoji: "💰", label: "COGS"         },
  { href: "/amazon/inventory",  emoji: "🏭", label: "Magazzino"    },
  { href: "/amazon/orders",     emoji: "🛒", label: "Ordini"       },
  { href: "/amazon/ppc",        emoji: "📣", label: "PPC"          },
  { href: "/amazon/payments",   emoji: "💳", label: "Pagamenti"    },
  { href: "/amazon/sync",       emoji: "⚙️", label: "Sync"         },
  { href: "/amazon/analytics",  emoji: "🧠", label: "Analytics"    },
];

export default function AmazonLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // Scroll active tab into view on navigation (e.g. direct link to /amazon/analytics)
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      inline:   "nearest",
      block:    "nearest",
    });
  }, [pathname]);

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Shared header — Amazon accent */}
      <AppHeader
        accentColor="amber"
        rightExtras={
          <>
            <div className="hidden sm:block"><SyncStatus /></div>
            <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
              <span>Amazon EU</span>
            </div>
          </>
        }
      />

      {/* Amazon sub-nav tabs */}
      <div className="relative border-b border-bg-border bg-bg-base">
        <nav
          className="flex items-center gap-0.5 sm:gap-1 py-2 overflow-x-auto px-3 sm:px-4 scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {AMAZON_TABS.map((t) => {
            const isActive = t.href === "/amazon"
              ? pathname === "/amazon"
              : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                ref={isActive ? activeTabRef : undefined}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-accent-amber/10 text-accent-amber border border-accent-amber/20"
                    : "text-zinc-400 hover:text-white hover:bg-bg-card border border-transparent"
                }`}
              >
                <span className="text-[12px] leading-none shrink-0">{t.emoji}</span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>
        {/* Fade hint — indicates the tab bar is scrollable on mobile */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-bg-base to-transparent" />
      </div>

      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
