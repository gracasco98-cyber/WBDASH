// amazon/routes/index.ts — Aggregator: mounts all sub-routers on their prefix
// This file replaces the old monolithic backend/src/amazon/routes.ts
import { Router } from "express";
import { ordersRouter } from "./orders.routes";
import { ordersExportRouter } from "./orders-export.routes";
import { productsRouter } from "./products.routes";
import { productsPerformanceRouter } from "./products-performance.routes";
import { settlementRouter } from "./settlement.routes";
import { settlementTransactionsRouter } from "./settlement-transactions.routes";
import { paymentsAuxRouter } from "./payments-aux.routes";
import { adsRouter } from "./ads.routes";
import { ppcExtraRouter, runSearchTermSync } from "./ppc-extra.routes";
import { cogsRouter } from "./cogs.routes";
import { inventoryRouter } from "./inventory.routes";
import { forecastRouter } from "./forecast.routes";
import { syncRouter } from "./sync.routes";
import { accountsRouter } from "./accounts.routes";

// Re-export runSearchTermSync so sync.job.ts dynamic import("./routes") still works
export { runSearchTermSync };

export const amazonRouter = Router();

// Orders domain: /overview, /summary, /timeseries, /orders (list)
amazonRouter.use("/", ordersRouter);

// Orders exports: /orders/export, /export/orders
amazonRouter.use("/", ordersExportRouter);

// Products domain: /products, /products/:asin/history, /pl
amazonRouter.use("/", productsRouter);

// Products performance domain: /products/performance, /products/:id, /products/identifiers/:id
amazonRouter.use("/", productsPerformanceRouter);

// Settlement domain: /dashboard, /payments
amazonRouter.use("/", settlementRouter);

// Settlement transactions: /payments/settlement/:id/transactions
amazonRouter.use("/", settlementTransactionsRouter);

// Settlement aux: /payments/dd7-reserve, /payments/unreconciled, /payments/export, /fees, /reimbursements
amazonRouter.use("/", paymentsAuxRouter);

// Ads/PPC domain: /ppc, /ppc/timeseries, /ppc/keywords, /ppc/campaigns/:id, /ads/*
amazonRouter.use("/", adsRouter);

// PPC extra: /ppc/products, /ppc/adgroups, /ppc/search-terms + runSearchTermSync
amazonRouter.use("/", ppcExtraRouter);

// COGS domain: /cogs, /cogs/entries, /cogs/bulk, /catalog/images
amazonRouter.use("/", cogsRouter);

// Inventory domain: /inventory, /fba-inventory
amazonRouter.use("/", inventoryRouter);

// Forecast domain: /payments/forecast, /forecast/calibration
amazonRouter.use("/", forecastRouter);

// Sync/Admin domain: /sync/*, /auth/*
amazonRouter.use("/", syncRouter);

// Account management: /accounts (list/create AmazonAccount)
amazonRouter.use("/", accountsRouter);

// Export default for backwards compatibility with server.ts import style
export default amazonRouter;
