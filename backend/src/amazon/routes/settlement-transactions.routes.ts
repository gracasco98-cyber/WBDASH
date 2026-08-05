// amazon/routes/settlement-transactions.routes.ts — /payments/settlement/:id/transactions
// Split from settlement.routes.ts to keep each file ≤500 LOC.
import { Router, Request, Response } from "express";
import { prisma } from "../../db";
import {
  findSettlementOrderGroups,
  countSettlementOrderGroups,
  findNonOrderMovements,
  findSettlementHeader,
  computeSettlementReconciliation,
  findCrossSettlementOrders,
} from "../../repositories/amazon/settlement.repo";

export const settlementTransactionsRouter = Router();

// ─── GET /payments/settlement/:settlementId/transactions ──────────
// Returns paginated order groups + non-order movements for a settlement
settlementTransactionsRouter.get("/payments/settlement/:settlementId/transactions", async (req: Request, res: Response) => {
  try {
    const { settlementId } = req.params;
    const page    = parseInt((req.query.page as string) ?? "1", 10);
    const limit   = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
    const search  = (req.query.search as string ?? "").trim().toLowerCase();
    const offset  = (page - 1) * limit;
    const searchParam = search || undefined;

    const orders = await findSettlementOrderGroups(prisma, { settlementId, search: searchParam, limit, offset });
    const total = await countSettlementOrderGroups(prisma, { settlementId, search: searchParam });
    const nonOrderMovements = await findNonOrderMovements(prisma, settlementId);
    const settlementHeader = await findSettlementHeader(prisma, settlementId);
    const reconcData = await computeSettlementReconciliation(prisma, settlementId);
    const crossMap = await findCrossSettlementOrders(prisma, {
      orderIds: orders.map(o => o.orderId),
      excludeSettlementId: settlementId,
    });

    const headerTotalAmount = settlementHeader ? settlementHeader.totalAmount : null;
    const computedNet = reconcData.computedNet;
    const diff = headerTotalAmount !== null ? headerTotalAmount - computedNet : 0;

    res.json({
      orders: orders.map(o => ({
        ...o,
        crossSettlements: crossMap.get(o.orderId) ?? [],
      })),
      nonOrderMovements,
      pagination: {
        page, limit,
        total,
        pages: Math.ceil(total / limit),
      },
      reconciliation: {
        headerTotalAmount,
        computedNet,
        orderNet:     reconcData.orderNet,
        nonOrderNet:  reconcData.nonOrderNet,
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
