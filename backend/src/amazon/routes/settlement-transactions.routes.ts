// amazon/routes/settlement-transactions.routes.ts — /payments/settlement/:id/transactions
// Split from settlement.routes.ts to keep each file ≤500 LOC.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import { getCurrentAccountId } from "../../context/account-context";

export const settlementTransactionsRouter = Router();

// ─── GET /payments/settlement/:settlementId/transactions ──────────
// Returns paginated order groups + non-order movements for a settlement
settlementTransactionsRouter.get("/payments/settlement/:settlementId/transactions", async (req: Request, res: Response) => {
  try {
    const amazonAccountId = getCurrentAccountId();
    const { settlementId } = req.params;
    const page    = parseInt((req.query.page as string) ?? "1", 10);
    const limit   = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
    const search  = (req.query.search as string ?? "").trim().toLowerCase();
    const offset  = (page - 1) * limit;

    type OrderRow = {
      orderId: string; sku: string | null; marketplace: string;
      postedDate: Date; principal: number; commission: number; fbaFee: number;
      shipping: number; vat: number; refundAmount: number; otherAmount: number;
      netAmount: number; hasRefund: boolean; lineCount: bigint;
    };

    const whereClause = search
      ? `AND ("orderId" ILIKE '%${search.replace(/'/g, "''")}%' OR "sku" ILIKE '%${search.replace(/'/g, "''")}%')`
      : "";

    const orders = await prisma.$queryRawUnsafe<OrderRow[]>(`
      SELECT
        "orderId",
        MAX("sku")                                                               AS sku,
        "marketplace",
        MIN("postedDate")                                                        AS "postedDate",
        COALESCE(SUM(CASE WHEN "amountType" = 'Principal'                    AND "transactionType" = 'Order'  THEN amount END), 0)::FLOAT8 AS principal,
        COALESCE(SUM(CASE WHEN "amountType" = 'Commission'                   AND "transactionType" = 'Order'  THEN amount END), 0)::FLOAT8 AS commission,
        COALESCE(SUM(CASE WHEN "amountType" = 'FBAPerUnitFulfillmentFee'                                      THEN amount END), 0)::FLOAT8 AS "fbaFee",
        COALESCE(SUM(CASE WHEN "amountType" IN ('Shipping','ShippingChargeback') AND "transactionType" = 'Order' THEN amount END), 0)::FLOAT8 AS shipping,
        COALESCE(SUM(CASE WHEN "amountType" LIKE 'MarketplaceFacilitatorVAT%' OR "amountType" IN ('Tax','ShippingTax') THEN amount END), 0)::FLOAT8 AS vat,
        COALESCE(SUM(CASE WHEN "transactionType" = 'Refund'                                                   THEN amount END), 0)::FLOAT8 AS "refundAmount",
        COALESCE(SUM(CASE WHEN "transactionType" NOT IN ('Order','Refund')                                    THEN amount END), 0)::FLOAT8 AS "otherAmount",
        COALESCE(SUM(amount), 0)::FLOAT8                                                                                   AS "netAmount",
        BOOL_OR("transactionType" = 'Refund')                                                                              AS "hasRefund",
        COUNT(*)::BIGINT                                                                                                    AS "lineCount"
      FROM "AmazonSettlementTransaction"
      WHERE "settlementId" = '${settlementId}' AND "orderId" IS NOT NULL AND "amazonAccountId" = '${amazonAccountId}' ${whereClause}
      GROUP BY "orderId", "marketplace"
      ORDER BY MIN("postedDate") DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    // ── Total count for pagination ───────────────────────────────────────────
    type CountRow = { total: bigint };
    const [{ total }] = await prisma.$queryRawUnsafe<CountRow[]>(`
      SELECT COUNT(DISTINCT "orderId") AS total
      FROM "AmazonSettlementTransaction"
      WHERE "settlementId" = '${settlementId}' AND "orderId" IS NOT NULL AND "amazonAccountId" = '${amazonAccountId}' ${whereClause}
    `);

    // ── Non-order movements (ServiceFee, storage, advertising, etc.) ──────────
    type NonOrderRow = { transactionType: string; amountType: string; amount: number; currency: string; postedDate: Date; cnt: bigint };
    const nonOrderMovements = await prisma.$queryRawUnsafe<NonOrderRow[]>(`
      SELECT
        "transactionType", "amountType", "currency",
        SUM(amount)::FLOAT8       AS amount,
        MIN("postedDate")         AS "postedDate",
        COUNT(*)::BIGINT          AS cnt
      FROM "AmazonSettlementTransaction"
      WHERE "settlementId" = '${settlementId}' AND ("orderId" IS NULL OR "orderId" = '') AND "amazonAccountId" = '${amazonAccountId}'
      GROUP BY "transactionType", "amountType", "currency"
      ORDER BY SUM(amount) ASC
    `);

    // ── Settlement header (for reconciliation summary) ────────────────────────
    const settlementHeader = await (prisma as any).amazonSettlement.findUnique({
      where: { amazonAccountId_settlementId: { amazonAccountId, settlementId } },
      select: { totalAmount: true, depositDate: true, startDate: true, endDate: true, currency: true, marketplace: true },
    }).catch(() => null);

    // ── Reconciliation: computed vs header ────────────────────────────────────
    type ReconcRow = { computed_net: number; order_net: number; non_order_net: number };
    const [reconcData] = await prisma.$queryRawUnsafe<ReconcRow[]>(`
      SELECT
        COALESCE(SUM(amount),0)::FLOAT8 AS computed_net,
        COALESCE(SUM(CASE WHEN "orderId" IS NOT NULL THEN amount ELSE 0 END),0)::FLOAT8 AS order_net,
        COALESCE(SUM(CASE WHEN "orderId" IS NULL THEN amount ELSE 0 END),0)::FLOAT8 AS non_order_net
      FROM "AmazonSettlementTransaction"
      WHERE "settlementId" = '${settlementId}' AND "amazonAccountId" = '${amazonAccountId}'
    `);

    // ── Cross-settlement check ─────────────────────────────────────────────────
    type CrossRow = { orderId: string; otherSettlements: string };
    const orderIds = orders.map(o => `'${o.orderId.replace(/'/g,"''")}'`).join(",");
    const crossSettlement: CrossRow[] = orderIds.length > 0 ? await prisma.$queryRawUnsafe<CrossRow[]>(`
      SELECT "orderId", STRING_AGG(DISTINCT "settlementId", ',' ORDER BY "settlementId") AS "otherSettlements"
      FROM "AmazonSettlementTransaction"
      WHERE "orderId" IN (${orderIds})
        AND "settlementId" != '${settlementId}'
        AND "amazonAccountId" = '${amazonAccountId}'
      GROUP BY "orderId"
    `) : [];

    const crossMap = new Map(crossSettlement.map(c => [c.orderId, c.otherSettlements.split(",")]));

    const headerTotalAmount = settlementHeader ? Number(settlementHeader.totalAmount) : null;
    const computedNet = Number(reconcData?.computed_net ?? 0);
    const diff = headerTotalAmount !== null ? headerTotalAmount - computedNet : 0;

    res.json({
      orders: orders.map(o => ({
        ...o,
        lineCount: Number(o.lineCount),
        crossSettlements: crossMap.get(o.orderId) ?? [],
      })),
      nonOrderMovements: nonOrderMovements.map(n => ({ ...n, cnt: Number(n.cnt) })),
      pagination: {
        page, limit,
        total: Number(total),
        pages: Math.ceil(Number(total) / limit),
      },
      reconciliation: {
        headerTotalAmount,
        computedNet,
        orderNet:     Number(reconcData?.order_net ?? 0),
        nonOrderNet:  Number(reconcData?.non_order_net ?? 0),
        diff,
        isComplete:  headerTotalAmount !== null && Math.abs(diff) < 1,
        needsResync: headerTotalAmount !== null && Math.abs(diff) > 1,
      },
    });
  } catch (err) {
    console.error("[payments/transactions]", err);
    res.status(500).json({ error: String(err) });
  }
});
