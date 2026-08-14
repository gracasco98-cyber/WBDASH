import { describe, it, expect } from "vitest";
import { mapMiraklOrder } from "../../src/mirakl/orderMapper";
import type { MiraklOrder } from "../../src/mirakl/client";

function makeOrder(overrides: Partial<MiraklOrder> = {}): MiraklOrder {
  return {
    orderId: "MK-1",
    orderState: "WAITING_ACCEPTANCE",
    createdDate: "2026-08-01T10:00:00Z",
    currencyIsoCode: "EUR",
    totalPrice: 44.97,
    customer: {
      email: "cliente@example.com",
      shippingAddress: {
        firstname: "Mario",
        lastname: "Rossi",
        street1: "Via Roma 1",
        street2: null,
        zipCode: "00100",
        city: "Roma",
        country: "Italy",
        countryIsoCode: "IT",
        phone: null,
      },
    },
    orderLines: [
      { id: "L1", offerSku: "SKU-001", productTitle: "Prodotto A", quantity: 2, price: 19.99, totalPrice: 39.98 },
    ],
    ...overrides,
  };
}

describe("mapMiraklOrder", () => {
  it("tags IT orders as redcare_it", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.tag).toBe("redcare_it");
    expect(mapped.country).toBe("IT");
  });

  it("tags DE orders as redcare_de", () => {
    const order = makeOrder({
      customer: {
        email: "kunde@example.de",
        shippingAddress: {
          firstname: "Hans", lastname: "Muller", street1: "Hauptstr 1", street2: null,
          zipCode: "10115", city: "Berlin", country: "Germany", countryIsoCode: "DE", phone: null,
        },
      },
    });
    const mapped = mapMiraklOrder(order);
    expect(mapped.tag).toBe("redcare_de");
    expect(mapped.country).toBe("DE");
  });

  it("maps order lines to sku/quantity pairs", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.lineItems).toEqual([{ sku: "SKU-001", quantity: 2 }]);
  });

  it("maps shipping address fields", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.shippingAddress).toEqual({
      firstName: "Mario",
      lastName: "Rossi",
      address1: "Via Roma 1",
      address2: null,
      zip: "00100",
      city: "Roma",
      country: "IT",
      phone: null,
    });
  });

  it("carries currency, email and totalAmount through", () => {
    const mapped = mapMiraklOrder(makeOrder());
    expect(mapped.currency).toBe("EUR");
    expect(mapped.email).toBe("cliente@example.com");
    expect(mapped.totalAmount).toBe(44.97);
  });

  it("throws when the order has no line items", () => {
    const order = makeOrder({ orderLines: [] });
    expect(() => mapMiraklOrder(order)).toThrow(/nessuna riga|non ha righe/i);
  });
});
