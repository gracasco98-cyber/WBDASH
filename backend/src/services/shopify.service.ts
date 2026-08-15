// shopify.service.ts — Shopify Admin GraphQL client with rate-limit handling
import type { AppErrorLog } from "@prisma/client";
import { prisma } from "../db";

const SHOPIFY_API_VERSION = "2025-01";
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const GQL_ENDPOINT = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

// ─── GraphQL fragments ────────────────────────────────────────────────────────
const ORDER_FIELDS = `
  id
  name
  createdAt
  updatedAt
  processedAt
  cancelledAt
  closedAt
  test
  tags
  sourceName
  sourceIdentifier
  displayFinancialStatus
  displayFulfillmentStatus
  currentTotalPriceSet {
    shopMoney { amount currencyCode }
  }
  totalRefundedSet {
    shopMoney { amount currencyCode }
  }
  channelInformation {
    channelDefinition {
      channelName
    }
    app {
      title
    }
  }
  lineItems(first: 50) {
    edges {
      node {
        id
        title
        quantity
        sku
        variantTitle
        image { url }
        originalUnitPriceSet { shopMoney { amount currencyCode } }
        discountedUnitPriceSet { shopMoney { amount currencyCode } }
        totalDiscountSet { shopMoney { amount currencyCode } }
        variant {
          id
          product {
            id
            featuredImage { url }
          }
        }
      }
    }
  }
`;

const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ${ORDER_FIELDS}
        }
      }
    }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ShopifyLineItem {
  id: string;
  title: string;
  quantity: number;
  sku: string | null;
  variantTitle: string | null;
  image: { url: string } | null;
  originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  discountedUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalDiscountSet: { shopMoney: { amount: string; currencyCode: string } };
  variant: {
    id: string;
    product: {
      id: string;
      featuredImage: { url: string } | null;
    } | null;
  } | null;
}

export interface ShopifyRawOrder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  test: boolean;
  tags: string[];
  sourceName: string | null;
  sourceIdentifier: string | null;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string | null;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } } | null;
  channelInformation: {
    channelDefinition?: { channelName: string } | null;
    app?: { title: string } | null;
  } | null;
  customer: { email: string } | null;
  shippingAddress: { countryCode: string } | null;
  lineItems: { edges: Array<{ node: ShopifyLineItem }> };
}

// ─── GraphQL executor with retry + rate limit ─────────────────────────────────
async function gqlRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  attempt = 0
): Promise<T> {
  const res = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  // Shopify rate limit: check header
  const callsHeader = res.headers.get("X-Shopify-Shop-Api-Call-Limit");
  if (callsHeader) {
    const [used, max] = callsHeader.split("/").map(Number);
    if (used > max * 0.8) {
      await sleep(1000); // back off when >80% quota used
    }
  }

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "2") * 1000;
    console.warn(`[Shopify] Rate limited. Retry in ${retryAfter}ms`);
    await sleep(retryAfter);
    return gqlRequest<T>(query, variables, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();

  if (json.errors) {
    // Throttled via extensions
    const throttle = json.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < 100 && attempt < 5) {
      const restoreIn = Math.ceil(
        (100 - throttle.currentlyAvailable) / throttle.restoreRate
      ) * 1000;
      console.warn(`[Shopify] Throttled. Waiting ${restoreIn}ms`);
      await sleep(restoreIn);
      return gqlRequest<T>(query, variables, attempt + 1);
    }
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Fetch paginated orders ───────────────────────────────────────────────────
export async function fetchOrdersSince(
  sinceDate: Date,
  onBatch: (orders: ShopifyRawOrder[]) => Promise<void>
): Promise<void> {
  const queryStr = `updated_at:>='${sinceDate.toISOString()}'`;
  let cursor: string | null = null;
  let page = 0;

  do {
    page++;
    const data = await gqlRequest<{
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string };
        edges: Array<{ node: ShopifyRawOrder }>;
      };
    }>(ORDERS_QUERY, {
      first: 50,
      after: cursor,
      query: queryStr,
    });

    const orders = data.orders.edges.map((e) => e.node);
    if (orders.length > 0) {
      console.log(`[Shopify] Page ${page}: fetched ${orders.length} orders`);
      await onBatch(orders);
    }

    cursor = data.orders.pageInfo.hasNextPage
      ? data.orders.pageInfo.endCursor
      : null;

    // Small delay between pages to be polite
    if (cursor) await sleep(250);
  } while (cursor);
}

// ─── Fetch single order by Shopify GID ───────────────────────────────────────
export async function fetchOrderById(
  shopifyOrderId: string
): Promise<ShopifyRawOrder | null> {
  const query = `
    query GetOrder($id: ID!) {
      order(id: $id) { ${ORDER_FIELDS} }
    }
  `;
  const data = await gqlRequest<{ order: ShopifyRawOrder | null }>(query, {
    id: shopifyOrderId,
  });
  return data.order;
}

// ─── Error logging helper ─────────────────────────────────────────────────────
export async function logError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>
) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${source}] ${message}`);
  try {
    await prisma.appErrorLog.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { source, message, stack, context: (context ?? {}) as any },
    });
  } catch (_) {}
}

// ─── Find variant by SKU (used by Mirakl order sync) ──────────────────────────
const VARIANT_BY_SKU_QUERY = `
  query FindVariantBySku($query: String!) {
    productVariants(first: 1, query: $query) {
      edges { node { id } }
    }
  }
`;

export async function findVariantIdBySku(sku: string): Promise<string | null> {
  const data = await gqlRequest<{
    productVariants: { edges: Array<{ node: { id: string } }> };
  }>(VARIANT_BY_SKU_QUERY, { query: `sku:${sku}` });
  return data.productVariants.edges[0]?.node.id ?? null;
}

// ─── Create order (used by Mirakl sync — orders arrive already paid) ─────────
const ORDER_CREATE_MUTATION = `
  mutation CreateOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order { id name }
      userErrors { field message }
    }
  }
`;

export interface CreateOrderInput {
  email: string | null;
  tags: string[];
  note: string;
  currency: string;
  totalAmount: number;
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string | null;
    zip: string;
    city: string;
    country: string;
    phone: string | null;
  };
  lineItems: Array<{ variantId: string; quantity: number; unitPrice: number }>;
}

export async function createOrder(
  input: CreateOrderInput
): Promise<{ id: string; name: string }> {
  const data = await gqlRequest<{
    orderCreate: {
      order: { id: string; name: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(ORDER_CREATE_MUTATION, {
    order: {
      email: input.email,
      tags: input.tags,
      note: input.note,
      currency: input.currency,
      lineItems: input.lineItems.map((li) => ({
        variantId: li.variantId,
        quantity: li.quantity,
        priceSet: {
          shopMoney: { amount: li.unitPrice.toFixed(2), currencyCode: input.currency },
        },
      })),
      shippingAddress: input.shippingAddress,
      transactions: [
        {
          kind: "SALE",
          status: "SUCCESS",
          gateway: "Mirakl",
          amountSet: {
            shopMoney: { amount: input.totalAmount.toFixed(2), currencyCode: input.currency },
          },
        },
      ],
    },
    options: {
      inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
    },
  });

  if (data.orderCreate.userErrors.length > 0) {
    throw new Error(`Shopify orderCreate errors: ${JSON.stringify(data.orderCreate.userErrors)}`);
  }
  if (!data.orderCreate.order) {
    throw new Error("Shopify orderCreate returned no order and no userErrors");
  }

  return data.orderCreate.order;
}

// ─── Find an order previously created by Mirakl sync, by its recovery tag ────
const ORDER_BY_TAG_QUERY = `
  query FindOrderByTag($query: String!) {
    orders(first: 1, query: $query) {
      edges { node { id name } }
    }
  }
`;

export async function findOrderByMiraklTag(
  miraklOrderId: string
): Promise<{ id: string; name: string } | null> {
  const data = await gqlRequest<{
    orders: { edges: Array<{ node: { id: string; name: string } }> };
  }>(ORDER_BY_TAG_QUERY, { query: `tag:'mirakl:${miraklOrderId}'` });
  return data.orders.edges[0]?.node ?? null;
}
