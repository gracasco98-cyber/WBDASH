"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, Wallet, Boxes, Megaphone, LifeBuoy, Shield,
  FileText, ClipboardList, Warehouse, Landmark, CalendarClock, PackageSearch, ReceiptText, Sparkles, LockKeyhole,
  ChevronDown, LayoutGrid, ClipboardCheck,
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
  items: readonly GroupItem[];
}

const GROUPS = [
  {
    key: "amministrazione", label: "GESTIONALE", icon: ShoppingBag,
    items: [
      { href: "/acquisti", label: "Panoramica" },
      { href: "/acquisti/anagrafiche", label: "Anagrafiche" },
      { href: "/acquisti/ordini", label: "Ordini Fornitore" },
      { href: "/acquisti/ordini", label: "Ricezioni / DDT" },
      { label: "Fatture Fornitore", comingSoon: true },
      { href: "/acquisti/magazzini", label: "Magazzini" },
      { href: "/acquisti/banche", label: "Banche" },
      { href: "/acquisti/condizioni-pagamento", label: "Condizioni pagamento" },
      { href: "/acquisti/scadenzario", label: "Scadenzario" },
      { href: "/acquisti/prima-nota", label: "Prima Nota" },
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
    key: "marketing", label: "MARKETING", icon: Megaphone,
    items: [
      { href: "/amazon/ppc", label: "Advertising" },
      { href: "/amazon/analytics", label: "Intelligence" },
      { href: "/marketing/redcare", label: "Redcare Keyword BI" },
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
] as const satisfies readonly Group[];

type GroupKey = (typeof GROUPS)[number]["key"];

const GROUP_ICON_CLASSES: Record<GroupKey, string> = {
  amministrazione: "text-accent-amber bg-accent-amber/10",
  inventory: "text-accent-primary bg-accent-primary/10",
  marketing: "text-accent-blue bg-accent-blue/10",
  supporto: "text-accent-blue bg-accent-blue/10",
  admin: "text-accent-red bg-accent-red/10",
};

function isNavItem(item: GroupItem): item is NavItem {
  return "href" in item;
}

const ITEM_ICONS: Record<string, typeof Wallet> = {
  "Panoramica": LayoutDashboard,
  "Overview": LayoutDashboard,
  "Anagrafiche": FileText,
  "Ordini Fornitore": ClipboardList,
  "Ricezioni / DDT": PackageSearch,
  "Magazzini": Warehouse,
  "Banche": Landmark,
  "Condizioni pagamento": ReceiptText,
  "Scadenzario": CalendarClock,
  "Prima Nota": Wallet,
  "P&L": Sparkles,
  "Pagamenti": Wallet,
  "COGS": ReceiptText,
  "Magazzino": Boxes,
  "Advertising": Megaphone,
  "Intelligence": Sparkles,
  "Redcare Keyword BI": Sparkles,
  "Gestione utenti": Shield,
  "Sync Center": PackageSearch,
  "Sicurezza": LockKeyhole,
};

/**
 * "/amazon" (Overview) is a literal string-prefix of every other /amazon/*
 * route across every group (P&L, COGS, PPC, ...), which now live as
 * separate sibling items rather than children of it — so unlike every
 * other href here, it must match exactly, never via startsWith, or every
 * /amazon/* page would also light up Overview as active.
 */
function isHrefActive(pathname: string, href: string): boolean {
  if (href === "/amazon") return pathname === "/amazon";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function GlobalSidebar() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    amministrazione: true, inventory: true, marketing: true, supporto: true, admin: true,
  });

  const toggle = (key: string) => setOpenGroups(g => ({ ...g, [key]: !g[key] }));

  const linkCls = (active: boolean) => `
    flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] transition-all border
    ${active
      ? "bg-accent-primary/10 border-accent-primary/20 text-accent-primary font-medium shadow-sm"
      : "border-transparent text-zinc-500 hover:text-white hover:bg-bg-hover"
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

        <Link
          href="/bacheca"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
            pathname.startsWith("/bacheca")
              ? "bg-accent-primary/12 border-accent-primary/25 text-accent-primary"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <LayoutGrid size={15} className="shrink-0" />
          Bacheca
        </Link>

        <Link
          href="/task-manager"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
            pathname.startsWith("/task-manager")
              ? "bg-accent-primary/12 border-accent-primary/25 text-accent-primary"
              : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ClipboardCheck size={15} className="shrink-0" />
          Task Manager
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
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md ${GROUP_ICON_CLASSES[group.key]}`}>
                    <Icon size={12} className="shrink-0" />
                  </span>
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
                    const ItemIcon = ITEM_ICONS[item.label] ?? FileText;
                    return (
                      <Link key={`${item.href}-${item.label}`} href={item.href} className={linkCls(active)}>
                        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${active ? "bg-accent-primary/15 text-accent-primary" : "bg-bg-hover text-zinc-500"}`}>
                          <ItemIcon size={11} />
                        </span>
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
