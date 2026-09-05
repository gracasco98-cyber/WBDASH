import type { SupplierPaymentDue } from "@/lib/api/payment-dues";

function csvField(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildScadenzarioCsv(rows: SupplierPaymentDue[]): string {
  const header = ["Scadenza", "Ordine", "Fornitore", "Rata", "Importo", "Stato"];
  const lines = rows.map(r => [
    r.dueDate.slice(0, 10),
    r.purchaseOrder.poNumber,
    r.purchaseOrder.supplier.legalName,
    String(r.installmentNumber),
    r.amount.toFixed(2),
    r.status === "PAID" ? "Pagato" : "Da pagare",
  ].map(csvField).join(";"));
  return [header.map(csvField).join(";"), ...lines].join("\n");
}
