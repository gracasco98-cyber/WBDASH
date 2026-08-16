// orderMapper.ts — Pure mapping from a Mirakl order to the shape needed to
// create a Shopify order. No network calls, no Prisma — easy to unit test.
import type { MiraklOrder } from "./client";

export interface MappedLineItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface MappedShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string | null;
  zip: string;
  city: string;
  country: string;
  phone: string | null;
}

export interface MappedOrder {
  tag: "redcare_it" | "redcare_de";
  country: "IT" | "DE";
  currency: string;
  email: string | null;
  totalAmount: number;   // totale ordine, spedizione inclusa
  shippingAmount: number;
  shippingAddress: MappedShippingAddress;
  lineItems: MappedLineItem[];
}

export function mapMiraklOrder(order: MiraklOrder): MappedOrder {
  if (order.orderLines.length === 0) {
    throw new Error(`Ordine Mirakl ${order.orderId} non ha righe`);
  }
  if (typeof order.shippingPrice !== "number") {
    throw new Error(`Ordine Mirakl ${order.orderId} non ha un shippingPrice valido`);
  }

  const addr = order.customer.shippingAddress;
  const country: "IT" | "DE" = addr.countryIsoCode.toUpperCase() === "DE" ? "DE" : "IT";
  const tag: "redcare_it" | "redcare_de" = country === "DE" ? "redcare_de" : "redcare_it";

  return {
    tag,
    country,
    currency: order.currencyIsoCode,
    email: order.customer.email,
    totalAmount: order.totalPrice,
    shippingAmount: order.shippingPrice,
    shippingAddress: {
      firstName: addr.firstname,
      lastName: addr.lastname,
      address1: addr.street1,
      address2: addr.street2,
      zip: addr.zipCode,
      city: addr.city,
      country: addr.countryIsoCode,
      phone: addr.phone,
    },
    lineItems: order.orderLines.map((l) => ({
      sku: l.offerSku,
      quantity: l.quantity,
      unitPrice: l.priceUnit,
    })),
  };
}
