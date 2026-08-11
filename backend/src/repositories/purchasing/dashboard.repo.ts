// repositories/purchasing/dashboard.repo.ts — Aggregate summary for the
// Acquisti/Amministrazione dashboard. Company-wide, no amazonAccountId.
// Read-only: no writes, safe to call as often as the frontend needs.
import type { PrismaClient, PurchaseOrderLogisticStatus } from "@prisma/client";

const REACHABLE_STATUSES: PurchaseOrderLogisticStatus[] = [
  "DRAFT", "SENT", "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED",
];

export interface StatusBreakdownEntry {
  status: PurchaseOrderLogisticStatus;
  count: number;
}

export interface OrdersOverTimePoint {
  date: string;
  count: number;
}

export interface TopSupplierEntry {
  supplierId: string;
  legalName: string;
  orderCount: number;
  totalValue: number;
}

export interface RecentOrderEntry {
  id: string;
  poNumber: string;
  supplierName: string;
  orderDate: Date;
  logisticStatus: PurchaseOrderLogisticStatus;
  totalValue: number;
}

export interface DashboardSummary {
  ordersInProgress: number;
  valueInProgress: number;
  activeSuppliers: number;
  statusBreakdown: StatusBreakdownEntry[];
  ordersOverTime: OrdersOverTimePoint[];
  topSuppliers: TopSupplierEntry[];
  recentOrders: RecentOrderEntry[];
}

export async function getDashboardSummary(prisma: PrismaClient): Promise<DashboardSummary> {
  const [
    ordersInProgress, valueAgg, activeSuppliers, statusGroups,
    timeSeriesRaw, topSuppliersRaw, recentOrdersRaw,
  ] = await Promise.all([
    prisma.purchaseOrder.count({ where: { logisticStatus: { not: "CANCELLED" } } }),
    prisma.purchaseOrderLine.aggregate({
      _sum: { totalAmount: true },
      where: { purchaseOrder: { logisticStatus: { not: "CANCELLED" } } },
    }),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchaseOrder.groupBy({ by: ["logisticStatus"], _count: { id: true } }),
    prisma.$queryRaw<{ date: string; count: number }[]>`
      SELECT TO_CHAR("orderDate", 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
      FROM "PurchaseOrder"
      WHERE "orderDate" >= NOW() - INTERVAL '30 days'
      GROUP BY TO_CHAR("orderDate", 'YYYY-MM-DD')
      ORDER BY date ASC
    `,
    prisma.$queryRaw<{ supplierId: string; legalName: string; orderCount: number; totalValue: number }[]>`
      SELECT s.id AS "supplierId", s."legalName" AS "legalName",
             COUNT(DISTINCT po.id)::int AS "orderCount",
             COALESCE(SUM(pol."totalAmount"), 0)::float AS "totalValue"
      FROM "Supplier" s
      JOIN "PurchaseOrder" po ON po."supplierId" = s.id
      JOIN "PurchaseOrderLine" pol ON pol."purchaseOrderId" = po.id
      GROUP BY s.id, s."legalName"
      ORDER BY "totalValue" DESC
      LIMIT 5
    `,
    prisma.purchaseOrder.findMany({
      take: 10,
      orderBy: { orderDate: "desc" },
      include: { supplier: { select: { legalName: true } }, lines: { select: { totalAmount: true } } },
    }),
  ]);

  const statusCounts = new Map(statusGroups.map((g) => [g.logisticStatus, g._count.id]));
  const statusBreakdown: StatusBreakdownEntry[] = REACHABLE_STATUSES.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }));

  const recentOrders: RecentOrderEntry[] = recentOrdersRaw.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.legalName,
    orderDate: po.orderDate,
    logisticStatus: po.logisticStatus,
    totalValue: po.lines.reduce((sum, l) => sum + Number(l.totalAmount), 0),
  }));

  return {
    ordersInProgress,
    valueInProgress: Number(valueAgg._sum.totalAmount ?? 0),
    activeSuppliers,
    statusBreakdown,
    ordersOverTime: padDailySeries(timeSeriesRaw, 30),
    topSuppliers: topSuppliersRaw,
    recentOrders,
  };
}

/** Fills every missing day in the last `days` days with count=0, so the chart is a continuous series, never sparse. */
function padDailySeries(raw: { date: string; count: number }[], days: number): OrdersOverTimePoint[] {
  const map = new Map(raw.map((r) => [r.date, r.count]));
  const result: OrdersOverTimePoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}
