// amazon/config.ts — Amazon module constants and marketplace mapping

export const EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";
export const NA_ENDPOINT = "https://sellingpartnerapi-na.amazon.com";
export const ADS_ENDPOINT = "https://advertising-api-eu.amazon.com";
export const TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";

/** Amazon Marketplace IDs — verified via /sellers/v1/marketplaceParticipations */
export const MARKETPLACE_IDS: Record<string, string> = {
  // EU region
  IT: "APJ6JRA9NG5V4",   // Amazon.it
  DE: "A1PA6795UKMFR9",  // Amazon.de
  FR: "A13V1IB3VIYZZH",  // Amazon.fr
  ES: "A1RKKUPIHCS9HS",  // Amazon.es
  PL: "A1C3SOZRARQ6R3",  // Amazon.pl
  UK: "A1F83G8C2ARO7P",  // Amazon.co.uk
  // NA region
  US: "ATVPDKIKX0DER",   // Amazon.com
  CA: "A2EUQ1WTGCTBG2",  // Amazon.ca
  MX: "A1AM78C64UM0Y8",  // Amazon.com.mx
};

/** EU marketplace IDs as array */
export const ALL_EU_MARKETPLACE_IDS = [
  MARKETPLACE_IDS.IT, MARKETPLACE_IDS.DE, MARKETPLACE_IDS.FR,
  MARKETPLACE_IDS.ES, MARKETPLACE_IDS.PL, MARKETPLACE_IDS.UK,
];

/** NA marketplace IDs as array */
export const ALL_NA_MARKETPLACE_IDS = [
  MARKETPLACE_IDS.US, MARKETPLACE_IDS.CA, MARKETPLACE_IDS.MX,
];

/** Which region endpoint to use for each marketplace code */
export const MARKETPLACE_REGION: Record<string, "EU" | "NA"> = {
  IT: "EU", DE: "EU", FR: "EU", ES: "EU", PL: "EU", UK: "EU",
  US: "NA", CA: "NA", MX: "NA",
};

/** Derive internal marketplace code from Amazon salesChannel string */
export const SALES_CHANNEL_TO_MARKETPLACE: Record<string, string> = {
  // EU
  "Amazon.it":     "IT",
  "Amazon.de":     "DE",
  "Amazon.fr":     "FR",
  "Amazon.es":     "ES",
  "amazon.it":     "IT",
  "amazon.de":     "DE",
  "amazon.fr":     "FR",
  "amazon.es":     "ES",
  // NA
  "Amazon.com":    "US",
  "amazon.com":    "US",
  "Amazon.ca":     "CA",
  "amazon.ca":     "CA",
  "Amazon.com.mx": "MX",
  "amazon.com.mx": "MX",
};

/** Report type used for order sync */
export const ORDER_REPORT_TYPE = "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL";

/** Maximum date range per SP-API report request (days) */
export const REPORT_MAX_DAYS = 30;

/** Polling interval for report status (ms) */
export const REPORT_POLL_INTERVAL_MS = 5_000;

/** Maximum poll attempts before giving up */
export const REPORT_MAX_POLLS = 120;
