"use client";
import Link from "next/link";
import { Users, ShoppingCart, Boxes, Landmark, CalendarClock } from "lucide-react";

const AREAS = [
  { href: "/acquisti/anagrafiche", label: "Anagrafiche", icon: Users },
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
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
          >
            <Icon size={20} className="text-emerald-600" />
            <span className="text-xs text-slate-700 font-medium">{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
