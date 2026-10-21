// lib/periodTileExplain.ts — the "how is this calculated" breakdown shown when
// clicking a period tile's Incasso or Margine pulito box. Pure: it only
// reshapes the figures the tile already displays.

const REDCARE_SHIPPING_PER_ORDER = 4.36;

export interface TileFigures {
  amazon?: {
    sales: number; units: number; refunds: number; refundsCount: number;
    vat: number; fees: number; feesEstimated: boolean; cogs: number; ads: number;
  };
  other?: {
    sales: number; units: number; refunds: number; refundCount: number;
    vat: number; fee: number; shipping: number; cogs: number; ads: number;
  };
  /** The margin the tile shows. */
  netProfit: number;
}

export interface ExplainLine {
  label: string;
  /** Signed: costs are negative. */
  amount: number;
  note?: string;
  /** Rendered with ≈ — the amount is partly an estimate. */
  estimated?: boolean;
  /** Informational line, not part of the sum (e.g. VAT contained in turnover). */
  info?: boolean;
}

export interface Explain {
  title: string;
  intro: string;
  lines: ExplainLine[];
  total: { label: string; amount: number; note?: string };
}

const fmtInt = (n: number) => n.toLocaleString("it-IT");
const pct = (part: number, whole: number) =>
  whole !== 0 ? `${((part / whole) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}% dell'incasso` : undefined;

export function buildIncassoExplain(f: TileFigures): Explain {
  const a = f.amazon, o = f.other;
  const sales = (a?.sales ?? 0) + (o?.sales ?? 0);
  const vat = (a?.vat ?? 0) + (o?.vat ?? 0);
  const refunds = (a?.refunds ?? 0) + (o?.refunds ?? 0);
  const refundCount = (a?.refundsCount ?? 0) + (o?.refundCount ?? 0);
  const lines: ExplainLine[] = [];
  if (a) lines.push({ label: "Amazon", amount: a.sales, note: `${fmtInt(a.units)} unità · totale live Amazon` });
  if (o) lines.push({ label: "Redcare / Shopify", amount: o.sales, note: `${fmtInt(o.units)} unità` });
  lines.push({ label: "di cui IVA", amount: vat, note: "da versare, non è un ricavo · scorporo 10/110", info: true });
  lines.push({ label: "Resi", amount: -refunds, note: `${fmtInt(refundCount)} resi · sottratti nel margine`, info: true });
  return {
    title: "Incasso (IVA inclusa)",
    intro: "Prezzo pagato dai clienti nel periodo, IVA inclusa. Ordini cancellati esclusi.",
    lines,
    total: { label: "Incasso", amount: sales },
  };
}

export function buildMarginExplain(f: TileFigures): Explain {
  const a = f.amazon, o = f.other;
  const sales = (a?.sales ?? 0) + (o?.sales ?? 0);
  const lines: ExplainLine[] = [{ label: "Incasso", amount: sales, note: "IVA inclusa" }];
  lines.push({ label: "Advertising", amount: -((a?.ads ?? 0) + (o?.ads ?? 0)), note: o ? "Amazon Ads + Ads Redcare" : "Amazon Ads" });
  if (a) {
    lines.push({
      label: "Fee Amazon", amount: -a.fees, estimated: a.feesEstimated,
      note: a.feesEstimated
        ? "reali sugli ordini liquidati, stima 15% + 3,80 €/pz sugli altri"
        : "reali, dai pagamenti Amazon",
    });
  }
  if (o) {
    lines.push({ label: "Fee Redcare", amount: -o.fee, note: "15% dell'incasso Redcare" });
    const orders = Math.round(o.shipping / REDCARE_SHIPPING_PER_ORDER);
    lines.push({ label: "Spedizioni Redcare", amount: -o.shipping, note: `4,36 € × ${fmtInt(orders)} ordini` });
  }
  lines.push({ label: "Merce (COGS)", amount: -((a?.cogs ?? 0) + (o?.cogs ?? 0)), note: "(costo/pz + spedizione inbound) × pezzi venduti" });
  lines.push({ label: "Resi", amount: -((a?.refunds ?? 0) + (o?.refunds ?? 0)) });
  lines.push({ label: "IVA", amount: -((a?.vat ?? 0) + (o?.vat ?? 0)), note: "scorporo 10/110 dell'incasso netto resi" });

  const residual = f.netProfit - lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(residual) >= 0.005) {
    lines.push({ label: "Altre rettifiche", amount: residual, note: "differenza tra la somma delle voci e il margine calcolato" });
  }
  return {
    title: "Margine pulito",
    intro: "Quello che resta in tasca: incasso meno tutti i costi del periodo e l'IVA da versare.",
    lines,
    total: { label: "Margine pulito", amount: f.netProfit, note: pct(f.netProfit, sales) },
  };
}
