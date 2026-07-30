// marketplace-rules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Modifica questo file per aggiungere/rimuovere marketplace.
// La detection avviene in ordine di priorità (priority ASC = più alta priorità).
// La logica è: tag → sourceName → channelDisplayName → fallback UNCLASSIFIED
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceRuleConfig {
  name: string;           // chiave interna univoca
  displayName: string;    // nome mostrato nella dashboard
  priority: number;       // 1 = massima priorità
  color: string;          // colore hex per la UI
  tagPatterns: string[];  // pattern case-insensitive cercati nei tag
  sourceNames: string[];  // valori esatti (case-insensitive) di sourceName
  channelNames: string[]; // valori parziali di channelDisplayName
}

export const MARKETPLACE_RULES: MarketplaceRuleConfig[] = [
  {
    name: "REDCARE_IT",
    displayName: "Redcare IT",
    priority: 10,
    color: "#ef4444",
    tagPatterns: ["redcare_it", "redcare-it", "redcareit", "redcare it"],
    sourceNames: ["redcare_it", "redcareit"],
    channelNames: ["redcare it"],
  },
  {
    name: "REDCARE_DE",
    displayName: "Redcare DE",
    priority: 11,
    color: "#dc2626",
    tagPatterns: ["redcare_de", "redcare-de", "redcaerde", "redcare de"],
    sourceNames: ["redcare_de", "redcaerde"],
    channelNames: ["redcare de"],
  },
  {
    name: "TEMU_IT",
    displayName: "Temu IT",
    priority: 20,
    color: "#f97316",
    tagPatterns: ["temu_it", "temu-it", "temuit", "temu it"],
    sourceNames: ["temu_it", "temuit"],
    channelNames: ["temu it"],
  },
  {
    name: "TEMU_ES",
    displayName: "Temu ES",
    priority: 21,
    color: "#fb923c",
    tagPatterns: ["temu_es", "temu-es", "temues", "temu es"],
    sourceNames: ["temu_es", "temues"],
    channelNames: ["temu es"],
  },
  {
    name: "TEMU_FR",
    displayName: "Temu FR",
    priority: 22,
    color: "#fdba74",
    tagPatterns: ["temu_fr", "temu-fr", "temufr", "temu fr"],
    sourceNames: ["temu_fr", "temufr"],
    channelNames: ["temu fr"],
  },
  {
    name: "TEMU_DE",
    displayName: "Temu DE",
    priority: 23,
    color: "#fed7aa",
    tagPatterns: ["temu_de", "temu-de", "temude", "temu de"],
    sourceNames: ["temu_de", "temude"],
    channelNames: ["temu de"],
  },
  {
    name: "EBAY",
    displayName: "eBay",
    priority: 30,
    color: "#3b82f6",
    tagPatterns: ["ebay", "e-bay", "e_bay"],
    sourceNames: ["ebay", "e-bay"],
    channelNames: ["ebay"],
  },
  {
    name: "BENU_FARMA",
    displayName: "Benu Farma",
    priority: 40,
    color: "#10b981",
    tagPatterns: ["benu farma", "benu_farma", "benu-farma", "benu"],
    sourceNames: ["benu", "benufarma", "benu_farma"],
    channelNames: ["benu"],
  },
  {
    name: "TIKTOK",
    displayName: "TikTok",
    priority: 50,
    color: "#8b5cf6",
    tagPatterns: ["tiktok", "tik tok", "tik_tok", "tik-tok"],
    sourceNames: ["tiktok", "tik_tok"],
    channelNames: ["tiktok", "tik tok"],
  },
  {
    name: "ALIEXPRESS",
    displayName: "AliExpress",
    priority: 70,
    color: "#f59e0b",
    tagPatterns: ["aliexpress", "ali express", "aliexpress it", "aliexpress de", "aliexpress fr", "aliexpress es"],
    sourceNames: ["aliexpress", "ali express", "ali-express"],
    channelNames: ["aliexpress", "ali express"],
  },
  {
    // Ordini diretti dal sito Shopify (web store) - tutti consolidati in SITO
    name: "SITO",
    displayName: "Web Store",
    priority: 999,   // ultima priority — fallback per ordini web diretti
    color: "#3b82f6",
    tagPatterns: [],
    sourceNames: ["web", "shopify_draft_order"],
    channelNames: ["online store", "shop"],
  },
];

// Normalizza una stringa per confronto: lowercase, no spazi extra, no trattini/underscore
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

export interface DetectionResult {
  marketplace: string;
  displayName: string;
  reason: string;
  color: string;
}

export function detectMarketplace(
  tags: string[],
  sourceName: string | null,
  channelDisplayName: string | null
): DetectionResult {
  const sortedRules = [...MARKETPLACE_RULES]
    .filter(() => true)
    .sort((a, b) => a.priority - b.priority);

  // ── Passo 0: Shop Apotheke è un sotto-canale Redcare — va assorbito ──────────
  // source "Shop Apotheke" (o tag "shop apotheke") → Redcare DE se c'è tag
  // "REDCARE DE", altrimenti Redcare IT (default).
  const isShopApotheke =
    (sourceName && normalizeForMatch(sourceName).includes("shop apotheke")) ||
    tags.some(t => normalizeForMatch(t).includes("shop apotheke"));

  if (isShopApotheke) {
    const hasRedcareDE = tags.some(t => normalizeForMatch(t).includes("redcare de"));
    if (hasRedcareDE) {
      return { marketplace: "REDCARE_DE", displayName: "Redcare DE", color: "#dc2626",
        reason: `Shop Apotheke sub-channel → REDCARE_DE (tag "REDCARE DE" trovato)` };
    }
    return { marketplace: "REDCARE_IT", displayName: "Redcare IT", color: "#ef4444",
      reason: `Shop Apotheke sub-channel → REDCARE_IT (default, nessun tag paese specifico)` };
  }

  // Step 1: TAG matching
  for (const rule of sortedRules) {
    for (const tag of tags) {
      const normalizedTag = normalizeForMatch(tag);
      for (const pattern of rule.tagPatterns) {
        if (normalizedTag.includes(normalizeForMatch(pattern))) {
          return {
            marketplace: rule.name,
            displayName: rule.displayName,
            reason: `Tag match: "${tag}" → pattern "${pattern}"`,
            color: rule.color,
          };
        }
      }
    }
  }

  // Step 2: sourceName matching
  if (sourceName) {
    const normalizedSource = normalizeForMatch(sourceName);
    for (const rule of sortedRules) {
      for (const sn of rule.sourceNames) {
        if (normalizedSource === normalizeForMatch(sn)) {
          return {
            marketplace: rule.name,
            displayName: rule.displayName,
            reason: `sourceName match: "${sourceName}" → "${sn}"`,
            color: rule.color,
          };
        }
      }
    }
  }

  // Step 3: channelDisplayName matching (partial)
  if (channelDisplayName) {
    const normalizedChannel = normalizeForMatch(channelDisplayName);
    for (const rule of sortedRules) {
      for (const cn of rule.channelNames) {
        if (normalizedChannel.includes(normalizeForMatch(cn))) {
          return {
            marketplace: rule.name,
            displayName: rule.displayName,
            reason: `channelDisplayName match: "${channelDisplayName}" → "${cn}"`,
            color: rule.color,
          };
        }
      }
    }
  }

  return {
    marketplace: "UNCLASSIFIED",
    displayName: "Non classificato",
    reason: `Nessuna regola applicabile. Tags: [${tags.join(", ")}] | source: ${sourceName ?? "null"} | channel: ${channelDisplayName ?? "null"}`,
    color: "#6b7280",
  };
}
