import type { GoodsReceipt } from "@/lib/api/purchase-orders";

export default function GoodsReceiptsList({ receipts }: { receipts: GoodsReceipt[] }) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 space-y-2">
      <h2 className="text-sm font-semibold text-white">DDT ricevuti</h2>
      {receipts.length === 0 && <div className="text-xs text-zinc-600">Nessun DDT registrato</div>}
      {receipts.map((r) => (
        <div key={r.id} className="text-xs text-zinc-400 border-b border-bg-border/40 pb-2">
          <span className="text-zinc-200 font-mono">{r.grnNumber}</span>
          {" — DDT "}{r.supplierDdtNumber}{" del "}{new Date(r.supplierDdtDate).toLocaleDateString("it-IT")}
          {" — ricevuto il "}{new Date(r.receiptDate).toLocaleDateString("it-IT")}
          {r.carrier ? ` — ${r.carrier}` : ""}
          <ul className="mt-1 space-y-0.5">
            {r.lines.map((l) => (
              <li key={l.id}>· {l.receivedQty} pz (riga {l.purchaseOrderLineId.slice(0, 8)})</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
