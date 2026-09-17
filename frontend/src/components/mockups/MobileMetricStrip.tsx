import { Package, ShoppingBag, Sigma } from "lucide-react";

interface MobileMetricStripProps {
  orders: number;
  units: number;
}

export default function MobileMetricStrip({ orders, units }: MobileMetricStripProps) {
  const unitsPerOrder = orders > 0 ? units / orders : 0;
  const metrics = [
    { label: "Ordini", value: orders.toLocaleString("it-IT"), icon: ShoppingBag },
    { label: "Unità vendute", value: `${units.toLocaleString("it-IT")} pz`, icon: Package, featured: true },
    { label: "Pezzi / ordine", value: unitsPerOrder.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), icon: Sigma },
  ];

  return (
    <dl className="grid grid-cols-3 overflow-hidden rounded-[11px] border border-[#dbe4ed] bg-white shadow-[0_3px_10px_rgba(20,33,61,.04)]">
      {metrics.map(({ label, value, icon: Icon, featured }) => (
        <div
          key={label}
          className={`min-w-0 px-2 py-2.5 text-center [&+&]:border-l [&+&]:border-[#e6ebf1] ${featured ? "bg-[#f1fbf7]" : ""}`}
        >
          <dt className={`flex items-center justify-center gap-1 text-[9px] font-bold leading-tight ${featured ? "text-[#168464]" : "text-[#718096]"}`}>
            <Icon size={11} aria-hidden="true" />
            {label}
          </dt>
          <dd className={`mt-1.5 whitespace-nowrap text-[15px] font-extrabold tabular-nums ${featured ? "text-[#107a5b]" : "text-[#172236]"}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
