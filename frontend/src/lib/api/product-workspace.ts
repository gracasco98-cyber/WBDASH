import { apiUrl, get } from "./client";

export type CellValue = string | number | null;
export interface WorkspaceMetric {
  date: string; sales: number; units: number; ppcSales: number; ppcUnits: number;
  ppcSpend: number; impressions: number; clicks: number;
}
export interface TrafficMetric {
  date: string; asin: string; sessions: number; pageViews: number;
  unitSessionPercentage: number | null;
}
export interface WorkbookRow { id: string; date: string; cells: Record<string, CellValue>; }
export interface WorkbookDocument { rows: WorkbookRow[]; hiddenColumns: string[]; deletedRowIds: string[]; }
export interface WorkspaceSectionData {
  overview: Record<string, unknown>;
  communication: Record<string, unknown>;
  ped: Record<string, unknown>;
  workbook: WorkbookDocument;
  assets: Record<string, unknown>;
}
export interface MarketingWorkspaceResponse {
  product: { id: string; name: string; brand: string | null; identifiers: Array<{ id: string; marketplace: string; asin: string | null; sku: string | null }> };
  identifier: { id: string; marketplace: string; asin: string | null; sku: string | null } | null;
  workspace: (WorkspaceSectionData & { id: string; trafficData?: TrafficMetric[]; lastSyncAt?: string; lastSyncStatus?: string; lastSyncError?: string }) | null;
  metrics: WorkspaceMetric[];
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method, credentials: "include", headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && response.status !== 207) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `API error ${response.status}`);
  }
  return response.json();
}

export const productWorkspace = {
  get: (productId: string, marketplace = "IT") => get<MarketingWorkspaceResponse>(`/api/amazon/marketing/products/${encodeURIComponent(productId)}/workspace`, { marketplace }),
  save: (productId: string, marketplace: string, data: Partial<WorkspaceSectionData>) => send<{ workspace: MarketingWorkspaceResponse["workspace"] }>(`/api/amazon/marketing/products/${encodeURIComponent(productId)}/workspace?marketplace=${marketplace}`, "PATCH", data),
  sync: (productId: string, marketplace: string) => send<MarketingWorkspaceResponse & { warning?: string }>(`/api/amazon/marketing/products/${encodeURIComponent(productId)}/sync?marketplace=${marketplace}`, "POST"),
  importExcel: (productId: string, marketplace: string, fileBase64: string) => send<{ importedRows: number; sheetNames: string[] }>(`/api/amazon/marketing/products/${encodeURIComponent(productId)}/workspace/import?marketplace=${marketplace}`, "POST", { fileBase64 }),
};
