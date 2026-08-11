"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, Wallet, Boxes, Megaphone, LifeBuoy, Shield,
  ChevronDown,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
}
interface ComingSoonItem {
  label: string;
  comingSoon: true;
}
type GroupItem = NavItem | ComingSoonItem;

interface Group {
  key: string;
  label: string;
  icon: typeof Wallet;
  items: GroupItem[];
}

const GROUPS: Group[] = [
  {
    key: "finance", label: "FINANCE", icon: Wallet,
    items: [
      { href: "/amazon", label: "Overview" },
      { href: "/amazon/pl", label: "P&L" },
      { href: "/amazon/payments", label: "Pagamenti" },
      { label: "Fisco", comingSoon: true },
      { label: "Regole fees/IVA/spedizioni", comingSoon: true },
      { label: "Reportistica", comingSoon: true },
    ],
  },
  {
    key: "inventory", label: "INVENTORY", icon: Boxes,
    items: [
      { href: "/amazon/cogs", label: "COGS" },
      { href: "/amazon/inventory", label: "Magazzino" },
    ],
  },
  {
    key: "acquisti", label: "ACQUISTI", icon: ShoppingBag,
    items: [
      { href: "/acquisti/fornitori", label: "Fornitori" },
      { href: "/acquisti/ordini", label: "Ordini Fornitore" },
      { label: "Ricezioni / DDT", comingSoon: true },
      { label: "Fatture Fornitore", comingSoon: true },
      { href: "/acquisti/magazzini", label: "Magazzini" },
      { href: "/acquisti/banche", label: "Banche" },
      { href: "/acquisti/condizioni-pagamento", label: "Condizioni pagamento" },
      { label: "Scadenzario", comingSoon: true },
      { label: "Prima Nota", comingSoon: true },
    ],
  },
  {
    key: "marketing", label: "MARKETING", icon: Megaphone,
    items: [
      { href: "/amazon/ppc", label: "Advertising" },
      { href: "/amazon/analytics", label: "Intelligence" },
      { label: "Content Hub", comingSoon: true },
      { label: "Calendario promo", comingSoon: true },
    ],
  },
  {
    key: "supporto", label: "SUPPORTO", icon: LifeBuoy,
    items: [
      { label: "I miei ticket", comingSoon: true },
    ],
  },
  {
    key: "admin", label: "ADMIN", icon: Shield,
    items: [
      { href: "/admin/users", label: "Gestione utenti" },
      { href: "/amazon/sync", label: "Sync Center" },
      { href: "/account/security", label: "Sicurezza" },
    ],
  },
];

function isNavItem(item: GroupItem): item is NavItem {
  return "href" in item;
}

/**
 * "/amazon" (Overview) is a literal string-prefix of every other /amazon/*
 * route across every group (P&L, COGS, PPC, ...), which now live as
 * separate sibling items rather than children of it — so unlike every
 * other href here, it must match exactly, never via startsWith, or every
 * /amazon/* page would also light up Overview (and FINANCE) as active.
 */
function isHrefActive(pathname: string, href: string): boolean {
  if (href === "/amazon") return pathname === "/amazon";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function GlobalSidebar() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    finance: true, inventory: true, acquisti: true, marketing: true, supporto: true, admin: true,
  });

  const toggle = (key: string) => setOpenGroups(g => ({ ...g, [key]: !g[key] }));

  const linkCls = (active: boolean) => `
    px-2.5 py-1.5 rounded-lg text-sm transition-all border block
    ${active
      ? "bg-accent-primary/10 border-accent-primary/20 text-accent-primary font-medium"
      : "border-transparent text-zinc-500 hover:text-white hover:bg-white/5"
    }
  `;

  return (
    <aside
      className="
        hidden md:flex flex-col w-56 shrink-0
        sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto
        border-r border-bg-border
        bg-bg-card
      "
    >
      <nav className="flex flex-col gap-0.5 py-3 px-2">
        <Link
          href="/"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
            pathname === "/"
              ? "bg-accent-primary/12 border-accent-primary/25 text-accent-primary"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <LayoutDashboard size={15} className="shrink-0" />
          Dashboard
        </Link>

        <Link
          href="/ordini"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
            pathname.startsWith("/ordini")
              ? "bg-accent-primary/12 border-accent-primary/25 text-accent-primary"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ShoppingCart size={15} className="shrink-0" />
          Ordini
        </Link>

        {GROUPS.map(group => {
          const Icon = group.icon;
          const open = openGroups[group.key];
          const groupActive = group.items.some(i => isNavItem(i) && isHrefActive(pathname, i.href));
          return (
            <div key={group.key} className="mt-2">
              <button
                onClick={() => toggle(group.key)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-widest transition-colors ${
                  groupActive ? "text-accent-primary" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={13} className="shrink-0" />
                  {group.label}
                </span>
                <ChevronDown size={12} className={`shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
              </button>

              {open && (
                <div className="mt-0.5 ml-3 pl-3 border-l border-zinc-800 flex flex-col gap-0.5">
                  {group.items.map(item => {
                    if (!isNavItem(item)) {
                      return (
                        <button
                          key={item.label}
                          disabled
                          title="Prossimamente"
                          className="px-2.5 py-1.5 rounded-lg text-sm text-left text-zinc-700 cursor-not-allowed flex items-center justify-between gap-2"
                        >
                          {item.label}
                          <span className="text-[9px] uppercase tracking-wide text-zinc-700 border border-zinc-800 rounded px-1 py-0.5 shrink-0">Prossimamente</span>
                        </button>
                      );
                    }
                    const active = isHrefActive(pathname, item.href);
                    return (
                      <Link key={item.href} href={item.href} className={linkCls(active)}>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
