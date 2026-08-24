// client.ts — Mirakl Connector API client (Redcare/Shop-Apotheke marketplace).
// Standalone: nessuna dipendenza da backend/src/amazon/**.
const MIRAKL_API_URL = process.env.MIRAKL_API_URL!;
const MIRAKL_API_KEY = process.env.MIRAKL_API_KEY!;

// ─── Public types (camelCase) ──────────────────────────────────────────────────
export interface MiraklShippingAddress {
  firstname: string;
  lastname: string;
  street1: string;
  street2: string | null;
  zipCode: string;
  city: string;
  country: string;
  countryIsoCode: string;
  phone: string | null;
}

export interface MiraklOrderLine {
  id: string;
  offerSku: string;
  productTitle: string;
  quantity: number;
  priceUnit: number;
  price: number;       // line total (qty * priceUnit, before shipping)
  totalPrice: number;
}

export interface MiraklOrder {
  orderId: string;
  orderState: string;
  createdDate: string;
  currencyIsoCode: string;
  totalPrice: number;  // order total, shipping included
  shippingPrice: number;
  // Tracking, presente direttamente sulla risposta OR11 per gli ordini SHIPPED
  // (verificato contro l'account reale, 2026-08-16) — nessuna chiamata extra
  // per ordine necessaria per l'import storico.
  shippingTracking: string | null;
  shippingTrackingUrl: string | null;
  shippingCompany: string | null;
  // Codice canale/paese (es. "IT", "DE") — fonte diretta e affidabile per la
  // decisione IT/DE, a differenza di shippingAddress.countryIsoCode che è
  // in formato ISO-3166-1 alpha-3 ("ITA"/"DEU"), verificato contro l'API reale.
  channelCode: string;
  customer: {
    // Fonte: customer_notification_email (a livello ordine nel payload reale,
    // non customer.email che non esiste) — indirizzo relay anonimizzato Mirakl,
    // non l'email reale del cliente.
    email: string | null;
    shippingAddress: MiraklShippingAddress;
  };
  orderLines: MiraklOrderLine[];
}

// ─── Raw wire types (snake_case, as documented in the Mirakl seller API) ──────
interface RawMiraklOrder {
  order_id: string;
  order_state: string;
  created_date: string;
  currency_iso_code: string;
  total_price: number;
  shipping_price: number;
  shipping_tracking: string | null;
  shipping_tracking_url: string | null;
  shipping_company: string | null;
  channel: { code: string };
  customer_notification_email: string | null;
  customer: {
    shipping_address: {
      firstname: string;
      lastname: string;
      street_1: string;
      street_2: string | null;
      zip_code: string;
      city: string;
      country: string;
      country_iso_code: string;
      phone: string | null;
    };
  };
  // Per lo schema OR11 reale: `price_unit` è il prezzo unitario, `price` è il
  // totale di riga (quantity * price_unit, spedizione esclusa).
  order_lines: Array<{
    order_line_id: string;
    offer_sku: string;
    product_title: string;
    quantity: number;
    price_unit: number;
    price: number;
    total_price: number;
  }>;
}

interface MiraklOrdersResponse {
  orders: RawMiraklOrder[];
  total_count: number;
}

function mapOrder(raw: RawMiraklOrder): MiraklOrder {
  return {
    orderId: raw.order_id,
    orderState: raw.order_state,
    createdDate: raw.created_date,
    currencyIsoCode: raw.currency_iso_code,
    totalPrice: raw.total_price,
    shippingPrice: raw.shipping_price,
    shippingTracking: raw.shipping_tracking,
    shippingTrackingUrl: raw.shipping_tracking_url,
    shippingCompany: raw.shipping_company,
    channelCode: raw.channel.code,
    customer: {
      email: raw.customer_notification_email,
      shippingAddress: {
        firstname: raw.customer.shipping_address.firstname,
        lastname: raw.customer.shipping_address.lastname,
        street1: raw.customer.shipping_address.street_1,
        street2: raw.customer.shipping_address.street_2,
        zipCode: raw.customer.shipping_address.zip_code,
        city: raw.customer.shipping_address.city,
        country: raw.customer.shipping_address.country,
        countryIsoCode: raw.customer.shipping_address.country_iso_code,
        phone: raw.customer.shipping_address.phone,
      },
    },
    orderLines: raw.order_lines.map((l) => ({
      id: l.order_line_id,
      offerSku: l.offer_sku,
      productTitle: l.product_title,
      quantity: l.quantity,
      priceUnit: l.price_unit,
      price: l.price,
      totalPrice: l.total_price,
    })),
  };
}

// ─── HTTP executor ──────────────────────────────────────────────────────────────
async function miraklRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MIRAKL_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: MIRAKL_API_KEY,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mirakl API error ${res.status}: ${text}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return (await res.json()) as T;
}

// ─── OR11 — fetch new orders needing a Shopify order created ───────────────────
// Verificato contro l'account reale (2026-08-16): questo canale non produce
// mai ordini in WAITING_ACCEPTANCE — arrivano già in RECEIVED (con
// order_line_state_reason_code "AUTO_RECEIVED"), quindi si interrogano
// entrambi gli stati per restare corretti anche se la configurazione cambia.
// Include anche SHIPPED: per questo account il fulfillment center spedisce
// spesso l'ordine entro pochi minuti dalla ricezione — più veloce del poll a
// 5 minuti — quindi un ordine può saltare direttamente da WAITING_ACCEPTANCE/
// RECEIVED a SHIPPED tra un giro e l'altro. Prima di questa modifica un
// ordine del genere spariva per sempre dalla vista del job live (mai creato
// su Shopify): confermato in produzione il 2026-08-22, 9 ordini reali persi
// così tra il 18 e il 21/08. runMiraklSync() già gestisce un ordine con
// tracking già presente (crea + evade subito), quindi qui basta allargare
// la query.
// OR11 pagina i risultati (10 per pagina di default) e ignorarlo lascia
// silenziosamente fuori tutto oltre la prima pagina — confermato in
// produzione il 2026-08-24: total_count=27 ordini aperti, la sola prima
// pagina ne restituiva 10, i 17 oltre non venivano mai sincronizzati (né
// creati su Shopify né importati in WBDASH). Si scorrono quindi tutte le
// pagine finché non si è raccolto l'intero total_count, con un tetto di
// sicurezza per non restare bloccati all'infinito se l'API si comportasse
// in modo inatteso (es. total_count sbagliato).
const MAX_ORDER_PAGES = 50; // 50 * 10 = 500 ordini aperti, ben oltre il volume reale attuale

async function fetchAllOrders(orderStateCodes: string): Promise<RawMiraklOrder[]> {
  const all: RawMiraklOrder[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_ORDER_PAGES; page++) {
    const data = await miraklRequest<MiraklOrdersResponse>(
      `/orders?order_state_codes=${orderStateCodes}&offset=${offset}`
    );
    all.push(...data.orders);
    offset += data.orders.length;
    if (data.orders.length === 0 || offset >= data.total_count) break;
  }
  return all;
}

export async function fetchNewOrders(): Promise<MiraklOrder[]> {
  const orders = await fetchAllOrders("WAITING_ACCEPTANCE,RECEIVED,SHIPPED");
  return orders.map(mapOrder);
}

// ─── OR11 — fetch already-shipped orders (one-off historical import) ──────────
export async function fetchShippedOrders(): Promise<MiraklOrder[]> {
  const orders = await fetchAllOrders("SHIPPED");
  return orders.map(mapOrder);
}

// ─── OR21 — accept an order (all lines) ────────────────────────────────────────
export async function acceptOrder(orderId: string, lineIds: string[]): Promise<void> {
  await miraklRequest(`/orders/${orderId}/accept`, {
    method: "PUT",
    body: JSON.stringify({
      order_lines: lineIds.map((id) => ({ id, accepted: true })),
    }),
  });
}

// ─── OR23 (tracking) + OR24 (ship) — mark an order as shipped ──────────────────
// OR23 aggiorna SOLO le informazioni di tracking: non fa transitare l'ordine
// nello stato SHIPPED. La documentazione Mirakl richiede di chiamare OR24
// (`PUT /orders/{order_id}/ship`, body vuoto) dopo ogni aggiornamento di
// tracking — senza, Mirakl non sa mai che l'ordine è partito e la SLA di
// spedizione non risulta rispettata.
export async function shipOrder(
  orderId: string,
  tracking: { carrierName: string; trackingNumber: string; carrierUrl?: string }
): Promise<void> {
  await miraklRequest(`/orders/${orderId}/tracking`, {
    method: "PUT",
    body: JSON.stringify({
      carrier_name: tracking.carrierName,
      tracking_number: tracking.trackingNumber,
      carrier_url: tracking.carrierUrl,
    }),
  });
  await miraklRequest(`/orders/${orderId}/ship`, { method: "PUT" });
}
