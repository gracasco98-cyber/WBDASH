import { prisma } from "../db";
import { runWithAccount } from "../context/account-context";
import { findActiveAccounts } from "../repositories/amazon/accounts.repo";
import { findProductById } from "../repositories/amazon/product.repo";
import {
  findDailyProductMetrics,
  listMarketingWorkspaces,
  upsertMarketingWorkspace,
} from "../repositories/amazon/marketing-workspace.repo";
import { fetchDailySalesAndTraffic } from "./data-kiosk.service";
import { italyDateString } from "./utils/datetime";

function dateRange(days = 90) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export async function syncMarketingProduct(productId: string, marketplace: string, days = 90) {
  const product = await findProductById(prisma, productId);
  if (!product) throw new Error("Prodotto non trovato");
  const identifier = product.identifiers.find((item) => item.channelType === "AMAZON" && item.marketplace === marketplace && item.asin);
  if (!identifier?.asin) throw new Error(`Nessun ASIN ${marketplace} collegato al prodotto`);
  const { from, to } = dateRange(days);

  await upsertMarketingWorkspace(prisma, { productId, marketplace, lastSyncStatus: "RUNNING", lastSyncError: null });
  try {
    const [metrics, traffic] = await Promise.all([
      findDailyProductMetrics(prisma, { asin: identifier.asin, marketplace, from, to }),
      fetchDailySalesAndTraffic({ asin: identifier.asin, marketplace, from: italyDateString(from), to: italyDateString(to) }),
    ]);
    const workspace = await upsertMarketingWorkspace(prisma, {
      productId, marketplace, trafficData: traffic as any,
      lastSyncAt: new Date(), lastSyncStatus: "DONE", lastSyncError: null,
    });
    return { product, identifier, metrics, traffic, workspace };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertMarketingWorkspace(prisma, {
      productId, marketplace, lastSyncAt: new Date(), lastSyncStatus: "PARTIAL", lastSyncError: message,
    });
    const metrics = await findDailyProductMetrics(prisma, { asin: identifier.asin, marketplace, from, to });
    return { product, identifier, metrics, traffic: [], workspace: null, warning: message };
  }
}

export async function runMarketingWorkspaceDailySync(): Promise<void> {
  const accounts = await findActiveAccounts(prisma);
  for (const account of accounts) {
    await runWithAccount(account.id, async () => {
      const workspaces = await listMarketingWorkspaces(prisma);
      for (const workspace of workspaces) {
        const result = await syncMarketingProduct(workspace.productId, workspace.marketplace);
        if (result.warning) console.warn(`[Marketing Workspace] ${workspace.productId}: ${result.warning}`);
      }
    });
  }
}

export function startMarketingWorkspaceDailySchedule(): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(4, 15, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const schedule = () => {
    runMarketingWorkspaceDailySync().catch((error) => console.error("[Marketing Workspace] daily sync", error));
    setTimeout(schedule, 86_400_000);
  };
  setTimeout(schedule, next.getTime() - now.getTime());
  console.log(`[Marketing Workspace] Daily sync scheduled in ${Math.round((next.getTime() - now.getTime()) / 60_000)} min`);
}
