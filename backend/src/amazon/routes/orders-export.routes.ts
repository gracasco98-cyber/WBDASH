// amazon/routes/orders-export.routes.ts — Order CSV export endpoints
// Split from orders.routes.ts to keep each file ≤500 LOC.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { findAmazonOrdersWithItems, findAmazonOrdersForExport } from "../../repositories/amazon/orders.repo";
import { getDateRange } from "../utils/datetime";
import { toCsv } from "./orders.routes";

export const ordersExportRouter = Router();

// ─── GET /export/orders (legacy alias) ────────────────────────────────────────
ordersExportRouter.get("/export/orders", async (req: Request, res: Response) => {
  try {
    const { filter = "last30", from, to, marketplace } = req.query as Record<string, string>;
    const range = getDateRange(filter, from, to);
    const where: any = { purchaseDate: range };
    if (marketplace && marketplace !== "all") where.marketplace = marketplace;

    const orders = await findAmazonOrdersWithItems(prisma, {
      from:  where.purchaseDate?.gte,
      to:    where.purchaseDate?.lte,
      marketplace: where.marketplace ?? undefined,
    });

    const rows: string[] = ["Data,Ordine Amazon,Marketplace,Stato,Canale,Paese,Fatturato,ASIN,SKU,Prodotto,Quantità,Prezzo Unità,Sconto Promo"];
    for (const o of orders) {
      if (o.items.length === 0) {
        rows.push([
          new Date(o.purchaseDate).toLocaleDateString("it-IT"),
          o.amazonOrderId, o.marketplace, o.orderStatus, o.fulfillmentChannel,
          o.shipCountry ?? "", o.itemTotal.toFixed(2), "", "", "", "", "", "",
        ].join(","));
      } else {
        for (const i of o.items) {
          rows.push([
            new Date(o.purchaseDate).toLocaleDateString("it-IT"),
            o.amazonOrderId, o.marketplace, o.orderStatus, o.fulfillmentChannel,
            o.shipCountry ?? "", o.itemTotal.toFixed(2),
            i.asin, i.sku ?? "", JSON.stringify(i.productTitle),
            i.quantityOrdered, i.itemPrice.toFixed(2), i.promotionDiscount.toFixed(2),
          ].join(","));
        }
      }
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"amazon_orders_" + filter + ".csv\"");
    res.send("﻿" + rows.join("\n")); // BOM for Excel
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /orders/export ────────────────────────────────────────────────────────
// Download all orders (up to 50k) as CSV with isPaid status
ordersExportRouter.get("/orders/export", async (req: Request, res: Response) => {
  try {
    const { marketplace, status, filter, from, to } = req.query as Record<string, string>;
    const range = getDateRange(filter ?? "last90", from, to);
    const dfStr = (range.gte ?? new Date(Date.now() - 90 * 86400000)).toISOString().split("T")[0];
    const dtStr = (range.lte ?? new Date()).toISOString().split("T")[0];

    const rows = await findAmazonOrdersForExport(prisma, {
      from: dfStr,
      to: dtStr,
      marketplace: marketplace && marketplace !== "all" ? marketplace : undefined,
      status: status && status !== "all" ? status : undefined,
    });

    const csv = toCsv(
      ["Order ID", "Marketplace", "Data Ordine", "Stato", "Canale", "Fulfillment", "Importo", "Valuta", "Pagato", "Settlement ID", "Data Deposito"],
      rows.map(r => [
        r.amazonOrderId, r.marketplace,
        r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString("it-IT") : "",
        r.orderStatus, r.salesChannel, r.fulfillmentChannel,
        r.itemTotal, r.currency,
        r.isPaid ? "Sì" : "No",
        r.settlementId ?? "",
        r.depositDate ?? "",
      ])
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="amazon_orders_${dfStr}_${dtStr}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[Amazon] GET /orders/export:", err);
    res.status(500).json({ error: String(err) });
  }
});
