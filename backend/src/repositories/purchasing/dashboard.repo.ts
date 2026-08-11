// repositories/purchasing/dashboard.repo.ts — Aggregate summary for the
// Acquisti/Amministrazione dashboard. Company-wide, no amazonAccountId.
// Read-only: no writes, safe to call as often as the frontend needs.
import type { PrismaClient, PurchaseOrderLogisticStatus } from "@prisma/client";
import { italyDayStart } from "../../amazon/utils/datetime";

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

const ORDERS_OVER_TIME_DAYS = 30;

export async function getDashboardSummary(prisma: PrismaClient): Promise<DashboardSummary> {
  const now = new Date();
  const todayStart = italyDayStart(now);
  const rangeStart = new Date(todayStart.getTime() - (ORDERS_OVER_TIME_DAYS - 1) * 86400000);

  const [
    ordersInProgress, valueAgg, activeSuppliers, statusGroups,
    ordersInRange, topSuppliersRaw, recentOrdersRaw,
  ] = await Promise.all([
    prisma.purchaseOrder.count({ where: { logisticStatus: { not: "CANCELLED" } } }),
    prisma.purchaseOrderLine.aggregate({
      _sum: { totalAmount: true },
      where: { purchaseOrder: { logisticStatus: { not: "CANCELLED" } } },
    }),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchaseOrder.groupBy({ by: ["logisticStatus"], _count: { id: true } }),
    // Bucketed in JS (below), not SQL — see bucketByItalyDay for why: SQL
    // TO_CHAR resolves in the Postgres session timezone, which can silently
    // diverge from Italy time (CLAUDE.md requires italyDayStart() for any
    // date-bucketing, precisely to avoid this class of drift).
    prisma.purchaseOrder.findMany({
      where: { orderDate: { gte: rangeStart } },
      select: { orderDate: true },
    }),
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
    ordersOverTime: bucketByItalyDay(ordersInRange.map((o) => o.orderDate), todayStart, ORDERS_OVER_TIME_DAYS),
    topSuppliers: topSuppliersRaw,
    recentOrders,
  };
}

/**
 * Buckets `dates` into Italy-local calendar days and zero-pads every missing
 * day in the last `days` days, so the chart is a continuous series, never
 * sparse. Both the bucket key for each order and the target day boundaries
 * are computed with the same italyDayStart() call (per CLAUDE.md's shared-
 * helper rule for date-related code), so a key always matches a boundary —
 * no timezone drift between "which day did this order land on" and "which
 * days does the chart expect."
 */
function bucketByItalyDay(dates: Date[], todayStart: Date, days: number): OrdersOverTimePoint[] {
  const counts = new Map<number, number>();
  for (const date of dates) {
    const key = italyDayStart(date).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: OrdersOverTimePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(todayStart.getTime() - i * 86400000);
    result.push({ date: dayStart.toISOString().slice(0, 10), count: counts.get(dayStart.getTime()) ?? 0 });
  }
  return result;
}
