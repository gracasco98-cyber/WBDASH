"use client";
import Link from "next/link";
import { Truck, ShoppingCart, Boxes, Landmark, CalendarClock } from "lucide-react";

const AREAS = [
  { href: "/acquisti/fornitori", label: "Fornitori", icon: Truck },
  { href: "/acquisti/ordini", label: "Ordini Fornitore", icon: ShoppingCart },
  { href: "/acquisti/magazzini", label: "Magazzini", icon: Boxes },
  { href: "/acquisti/banche", label: "Banche", icon: Landmark },
  { href: "/acquisti/condizioni-pagamento", label: "Condizioni pagamento", icon: CalendarClock },
];

export default function WorkAreasHub() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {AREAS.map(a => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-bg-border bg-bg-card p-4 text-center hover:border-accent-primary/30 hover:bg-bg-hover transition-colors"
          >
            <Icon size={20} className="text-accent-primary" />
            <span className="text-xs text-zinc-300 font-medium">{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
