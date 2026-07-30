"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  CreditCard,
  BarChart2,
  RefreshCw,
  FileBarChart,
} from "lucide-react";

const LINKS: Array<{
  href:  string;
  label: string;
  icon:  React.ElementType;
  match: (p: string) => boolean;
  group?: string;
}> = [
  {
    href:  "/",
    label: "Overview",
    icon:  LayoutDashboard,
    match: (p) => p === "/",
    group: "Web Store",
  },
  {
    href:  "/products",
    label: "Marketplace",
    icon:  ShoppingBag,
    match: (p) => p === "/products",
    group: "Web Store",
  },
  {
    href:  "/amazon",
    label: "Dashboard",
    icon:  Package,
    match: (p) => p === "/amazon",
    group: "Amazon",
  },
  {
    href:  "/amazon/products",
    label: "Prodotti",
    icon:  FileBarChart,
    match: (p) => p === "/amazon/products",
    group: "Amazon",
  },
  {
    href:  "/amazon/payments",
    label: "Pagamenti",
    icon:  CreditCard,
    match: (p) => p === "/amazon/payments",
    group: "Amazon",
  },
  {
    href:  "/amazon/ppc",
    label: "PPC / Ads",
    icon:  BarChart2,
    match: (p) => p === "/amazon/ppc",
    group: "Amazon",
  },
  {
    href:  "/amazon/sync",
    label: "Sync Center",
    icon:  RefreshCw,
    match: (p) => p === "/amazon/sync",
    group: "Amazon",
  },
];

export default function DesktopSidebar() {
  const pathname = usePathname();

  let lastGroup = "";
  const items: JSX.Element[] = [];

  for (const link of LINKS) {
    const isActive = link.match(pathname);

    if (link.group && link.group !== lastGroup) {
      lastGroup = link.group;
      const isAmazon = link.group === "Amazon";
      items.push(
        <p
          key={`group-${link.group}`}
          className={`text-[9px] uppercase tracking-widest font-semibold px-3 pt-4 pb-1 ${
            isAmazon ? "text-amber-600/70" : "text-zinc-600"
          }`}
        >
          {link.group}
        </p>
      );
    }

    items.push(
      <Link
        key={link.href}
        href={link.href}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
          isActive
            ? "bg-accent-primary/10 border border-accent-primary/20 text-accent-primary font-medium"
            : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border border-transparent"
        }`}
      >
        <link.icon size={14} className="shrink-0" />
        {link.label}
      </Link>
    );
  }

  return (
    <aside className="hidden md:flex flex-col w-44 shrink-0 border-r border-bg-border overflow-y-auto py-2 px-2 bg-bg-base">
      <nav className="flex flex-col gap-0.5">{items}</nav>
    </aside>
  );
}
