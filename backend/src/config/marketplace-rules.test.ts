// marketplace-rules.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// PR 5 — Lock in current behavior of detectMarketplace().
// Pure unit tests: no DB, no mocks, no Prisma.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  MARKETPLACE_RULES,
  detectMarketplace,
  normalizeForMatch,
} from './marketplace-rules';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Rules that are expected to participate in tag/source/channel matching.
 *  The MarketplaceRuleConfig interface has no `isActive` field — every entry
 *  in the exported array is considered active.
 *  LOCK-IN: The config has no isActive flag; all rules are always active.
 */
const ALL_RULES = MARKETPLACE_RULES;

// ─────────────────────────────────────────────────────────────────────────────
// 1. normalizeForMatch — utility used by the detection logic
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeForMatch', () => {
  it('lowercases the string', () => {
    expect(normalizeForMatch('REDCARE_IT')).toBe('redcare it');
  });

  it('replaces underscores with a single space', () => {
    expect(normalizeForMatch('temu_it')).toBe('temu it');
  });

  it('replaces hyphens with a single space', () => {
    expect(normalizeForMatch('temu-it')).toBe('temu it');
  });

  it('collapses multiple separators to a single space', () => {
    expect(normalizeForMatch('temu__it')).toBe('temu it');
    expect(normalizeForMatch('temu--it')).toBe('temu it');
    expect(normalizeForMatch('temu -_it')).toBe('temu it');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeForMatch('  temu it  ')).toBe('temu it');
  });

  it('handles empty string', () => {
    expect(normalizeForMatch('')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Each active rule fires on its own primary tag pattern (data-driven)
// ─────────────────────────────────────────────────────────────────────────────
describe('each rule matches its primary tag pattern', () => {
  // LOCK-IN: SITO has no tagPatterns — it relies on sourceName/channelName only.
  const rulesWithTags = ALL_RULES.filter(r => r.tagPatterns.length > 0);

  for (const rule of rulesWithTags) {
    const primaryTag = rule.tagPatterns[0];
    it(`${rule.name} — primary tag "${primaryTag}"`, () => {
      const result = detectMarketplace([primaryTag], null, null);
      expect(result.marketplace).toBe(rule.name);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Every tag pattern in every rule matches (comprehensive, data-driven)
// ─────────────────────────────────────────────────────────────────────────────
describe('each rule matches ALL its tag patterns', () => {
  const rulesWithTags = ALL_RULES.filter(r => r.tagPatterns.length > 0);

  for (const rule of rulesWithTags) {
    for (const pattern of rule.tagPatterns) {
      it(`${rule.name} matches tag pattern "${pattern}"`, () => {
        const result = detectMarketplace([pattern], null, null);
        expect(result.marketplace).toBe(rule.name);
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Priority ordering — lower priority number wins when multiple tags match
// ─────────────────────────────────────────────────────────────────────────────
describe('priority ordering with multiple matching tags', () => {
  it('REDCARE_IT (p10) beats TEMU_IT (p20) when both tags present', () => {
    const result = detectMarketplace(['redcare_it', 'temu_it'], null, null);
    expect(result.marketplace).toBe('REDCARE_IT');
  });

  it('REDCARE_IT (p10) beats REDCARE_DE (p11) when both tags present', () => {
    const result = detectMarketplace(['redcare_it', 'redcare_de'], null, null);
    expect(result.marketplace).toBe('REDCARE_IT');
  });

  it('REDCARE_DE (p11) beats EBAY (p30) when both tags present', () => {
    const result = detectMarketplace(['redcare_de', 'ebay'], null, null);
    expect(result.marketplace).toBe('REDCARE_DE');
  });

  it('EBAY (p30) beats TIKTOK (p50) when both tags present', () => {
    const result = detectMarketplace(['ebay', 'tiktok'], null, null);
    expect(result.marketplace).toBe('EBAY');
  });

  it('returns the reason field explaining which tag matched', () => {
    const result = detectMarketplace(['redcare_it', 'temu_it'], null, null);
    expect(result.reason).toMatch(/tag match/i);
    expect(result.reason).toContain('redcare_it');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Case insensitivity
// ─────────────────────────────────────────────────────────────────────────────
describe('case insensitivity', () => {
  it('matches uppercase tag REDCARE_IT', () => {
    const result = detectMarketplace(['REDCARE_IT'], null, null);
    expect(result.marketplace).toBe('REDCARE_IT');
  });

  it('matches mixed-case tag Redcare_It', () => {
    const result = detectMarketplace(['Redcare_It'], null, null);
    expect(result.marketplace).toBe('REDCARE_IT');
  });

  it('matches uppercase TEMU_IT', () => {
    const result = detectMarketplace(['TEMU_IT'], null, null);
    expect(result.marketplace).toBe('TEMU_IT');
  });

  it('matches mixed-case EBAY tag Ebay', () => {
    const result = detectMarketplace(['Ebay'], null, null);
    expect(result.marketplace).toBe('EBAY');
  });

  it('matches uppercase TIKTOK', () => {
    const result = detectMarketplace(['TIKTOK'], null, null);
    expect(result.marketplace).toBe('TIKTOK');
  });

  it('matches lowercase aliexpress', () => {
    const result = detectMarketplace(['aliexpress'], null, null);
    expect(result.marketplace).toBe('ALIEXPRESS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Separator tolerance (_/-/space all equivalent after normalisation)
// ─────────────────────────────────────────────────────────────────────────────
describe('separator tolerance', () => {
  // REDCARE_IT primary patterns explicitly include all variants,
  // so these tests verify the runtime matching, not just the data.
  it('redcare_it (underscore) matches REDCARE_IT', () => {
    expect(detectMarketplace(['redcare_it'], null, null).marketplace).toBe('REDCARE_IT');
  });

  it('redcare-it (hyphen) matches REDCARE_IT', () => {
    expect(detectMarketplace(['redcare-it'], null, null).marketplace).toBe('REDCARE_IT');
  });

  it('"redcare it" (space) matches REDCARE_IT', () => {
    expect(detectMarketplace(['redcare it'], null, null).marketplace).toBe('REDCARE_IT');
  });

  it('REDCARE-IT (uppercase + hyphen) matches REDCARE_IT', () => {
    expect(detectMarketplace(['REDCARE-IT'], null, null).marketplace).toBe('REDCARE_IT');
  });

  it('temu_es matches TEMU_ES', () => {
    expect(detectMarketplace(['temu_es'], null, null).marketplace).toBe('TEMU_ES');
  });

  it('temu-es matches TEMU_ES', () => {
    expect(detectMarketplace(['temu-es'], null, null).marketplace).toBe('TEMU_ES');
  });

  it('"temu es" matches TEMU_ES', () => {
    expect(detectMarketplace(['temu es'], null, null).marketplace).toBe('TEMU_ES');
  });

  it('tik_tok matches TIKTOK', () => {
    expect(detectMarketplace(['tik_tok'], null, null).marketplace).toBe('TIKTOK');
  });

  it('tik-tok matches TIKTOK', () => {
    expect(detectMarketplace(['tik-tok'], null, null).marketplace).toBe('TIKTOK');
  });

  it('"tik tok" matches TIKTOK', () => {
    expect(detectMarketplace(['tik tok'], null, null).marketplace).toBe('TIKTOK');
  });

  it('benu_farma matches BENU_FARMA', () => {
    expect(detectMarketplace(['benu_farma'], null, null).marketplace).toBe('BENU_FARMA');
  });

  it('benu-farma matches BENU_FARMA', () => {
    expect(detectMarketplace(['benu-farma'], null, null).marketplace).toBe('BENU_FARMA');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. sourceName fallback (Step 2 — fires when no tag matches)
// ─────────────────────────────────────────────────────────────────────────────
describe('sourceName fallback', () => {
  it('detects REDCARE_IT via sourceName "redcare_it"', () => {
    const result = detectMarketplace([], 'redcare_it', null);
    expect(result.marketplace).toBe('REDCARE_IT');
    expect(result.reason).toMatch(/sourceName match/i);
  });

  it('detects TEMU_IT via sourceName "temu_it"', () => {
    const result = detectMarketplace([], 'temu_it', null);
    expect(result.marketplace).toBe('TEMU_IT');
  });

  it('detects EBAY via sourceName "ebay"', () => {
    const result = detectMarketplace([], 'ebay', null);
    expect(result.marketplace).toBe('EBAY');
  });

  it('detects BENU_FARMA via sourceName "benufarma"', () => {
    const result = detectMarketplace([], 'benufarma', null);
    expect(result.marketplace).toBe('BENU_FARMA');
  });

  it('detects SITO via sourceName "web"', () => {
    const result = detectMarketplace([], 'web', null);
    expect(result.marketplace).toBe('SITO');
  });

  it('detects SITO via sourceName "shopify_draft_order"', () => {
    const result = detectMarketplace([], 'shopify_draft_order', null);
    expect(result.marketplace).toBe('SITO');
  });

  it('sourceName match is case-insensitive: "REDCARE_IT" → REDCARE_IT', () => {
    const result = detectMarketplace([], 'REDCARE_IT', null);
    // LOCK-IN: sourceName uses exact normalized comparison (===), so
    // 'REDCARE_IT' normalizes to 'redcare it', which matches 'redcare_it'
    // (also normalizes to 'redcare it'). Should resolve to REDCARE_IT.
    expect(result.marketplace).toBe('REDCARE_IT');
  });

  it('sourceName "EBAY" (uppercase) → EBAY', () => {
    const result = detectMarketplace([], 'EBAY', null);
    expect(result.marketplace).toBe('EBAY');
  });

  it('tag matching takes precedence over sourceName', () => {
    // Tag says TEMU_IT but sourceName says redcare_it → tag wins (Step 1 before Step 2)
    const result = detectMarketplace(['temu_it'], 'redcare_it', null);
    expect(result.marketplace).toBe('TEMU_IT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. channelDisplayName partial-match fallback (Step 3)
// ─────────────────────────────────────────────────────────────────────────────
describe('channelDisplayName fallback', () => {
  it('detects REDCARE_IT via channelDisplayName "Redcare IT"', () => {
    const result = detectMarketplace([], null, 'Redcare IT');
    expect(result.marketplace).toBe('REDCARE_IT');
    expect(result.reason).toMatch(/channelDisplayName match/i);
  });

  it('detects TEMU_IT via channelDisplayName "Temu IT"', () => {
    const result = detectMarketplace([], null, 'Temu IT');
    expect(result.marketplace).toBe('TEMU_IT');
  });

  it('detects EBAY via channelDisplayName "eBay Global"', () => {
    // "ebay" pattern is a substring of "ebay global"
    const result = detectMarketplace([], null, 'eBay Global');
    expect(result.marketplace).toBe('EBAY');
  });

  it('detects TIKTOK via channelDisplayName "TikTok Shop"', () => {
    const result = detectMarketplace([], null, 'TikTok Shop');
    expect(result.marketplace).toBe('TIKTOK');
  });

  it('detects SITO via channelDisplayName "Online Store"', () => {
    const result = detectMarketplace([], null, 'Online Store');
    expect(result.marketplace).toBe('SITO');
  });

  it('sourceName match takes precedence over channelDisplayName', () => {
    // sourceName says EBAY, channel says "Redcare IT" → sourceName wins (Step 2 before Step 3)
    const result = detectMarketplace([], 'ebay', 'Redcare IT');
    expect(result.marketplace).toBe('EBAY');
  });

  it('channelDisplayName match is case-insensitive', () => {
    const result = detectMarketplace([], null, 'REDCARE IT');
    expect(result.marketplace).toBe('REDCARE_IT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. UNCLASSIFIED fallback
// ─────────────────────────────────────────────────────────────────────────────
describe('UNCLASSIFIED fallback', () => {
  it('returns UNCLASSIFIED when nothing matches', () => {
    const result = detectMarketplace(['unknown-source'], 'some-store', 'My Channel');
    expect(result.marketplace).toBe('UNCLASSIFIED');
  });

  it('returns correct displayName for UNCLASSIFIED', () => {
    const result = detectMarketplace([], null, null);
    expect(result.displayName).toBe('Non classificato');
  });

  it('UNCLASSIFIED reason lists tags, source, and channel', () => {
    const result = detectMarketplace(['mytag'], 'mysource', 'mychannel');
    expect(result.reason).toContain('mytag');
    expect(result.reason).toContain('mysource');
    expect(result.reason).toContain('mychannel');
  });

  it('UNCLASSIFIED reason shows "null" for missing source', () => {
    const result = detectMarketplace([], null, null);
    expect(result.reason).toContain('null');
  });

  it('UNCLASSIFIED color is the grey sentinel', () => {
    const result = detectMarketplace([], null, null);
    expect(result.color).toBe('#6b7280');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. "isActive" note — this config has NO isActive field
// ─────────────────────────────────────────────────────────────────────────────
describe('isActive field behavior', () => {
  // LOCK-IN: MarketplaceRuleConfig does not have an isActive field.
  // All rules in MARKETPLACE_RULES are always active. The original spec
  // requested an isActive flag test, but the current config does not implement
  // it. Document the absence rather than fabricating behavior.
  it('MarketplaceRuleConfig does not include an isActive field', () => {
    const rule = MARKETPLACE_RULES[0] as unknown as Record<string, unknown>;
    expect(rule['isActive']).toBeUndefined();
  });

  it('all rules in the array are effectively active', () => {
    // Verify all rules participate — every rule with tag patterns resolves a match.
    const rulesWithTags = ALL_RULES.filter(r => r.tagPatterns.length > 0);
    for (const rule of rulesWithTags) {
      const result = detectMarketplace([rule.tagPatterns[0]], null, null);
      expect(result.marketplace).toBe(rule.name);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Empty / null / edge inputs don't crash
// ─────────────────────────────────────────────────────────────────────────────
describe('empty and edge-case inputs', () => {
  it('detectMarketplace([], null, null) returns UNCLASSIFIED without throwing', () => {
    expect(() => detectMarketplace([], null, null)).not.toThrow();
    expect(detectMarketplace([], null, null).marketplace).toBe('UNCLASSIFIED');
  });

  it("detectMarketplace([''], null, null) returns UNCLASSIFIED without throwing", () => {
    expect(() => detectMarketplace([''], null, null)).not.toThrow();
    expect(detectMarketplace([''], null, null).marketplace).toBe('UNCLASSIFIED');
  });

  it('detectMarketplace with empty-string source returns UNCLASSIFIED', () => {
    // LOCK-IN: empty string is falsy — sourceName step is skipped when falsy
    // In JS `if (sourceName)` with '' is falsy, so empty string = no match.
    const result = detectMarketplace([], '', null);
    expect(result.marketplace).toBe('UNCLASSIFIED');
  });

  it('detectMarketplace with empty-string channel returns UNCLASSIFIED', () => {
    const result = detectMarketplace([], null, '');
    expect(result.marketplace).toBe('UNCLASSIFIED');
  });

  it('whitespace-only tag does not match any rule', () => {
    const result = detectMarketplace(['   '], null, null);
    expect(result.marketplace).toBe('UNCLASSIFIED');
  });

  it('result always has all 4 fields (marketplace, displayName, reason, color)', () => {
    const result = detectMarketplace([], null, null);
    expect(result).toHaveProperty('marketplace');
    expect(result).toHaveProperty('displayName');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('color');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Shop Apotheke special handling (Passo 0 in the detection logic)
// ─────────────────────────────────────────────────────────────────────────────
describe('Shop Apotheke sub-channel handling', () => {
  it('sourceName "shop apotheke" defaults to REDCARE_IT', () => {
    const result = detectMarketplace([], 'shop apotheke', null);
    expect(result.marketplace).toBe('REDCARE_IT');
    expect(result.reason).toMatch(/Shop Apotheke/);
  });

  it('tag "shop apotheke" defaults to REDCARE_IT', () => {
    const result = detectMarketplace(['shop apotheke'], null, null);
    expect(result.marketplace).toBe('REDCARE_IT');
  });

  it('tag "shop apotheke" + tag "redcare de" → REDCARE_DE', () => {
    const result = detectMarketplace(['shop apotheke', 'redcare de'], null, null);
    expect(result.marketplace).toBe('REDCARE_DE');
    expect(result.reason).toMatch(/REDCARE_DE/);
  });

  it('sourceName "Shop Apotheke" (mixed case) defaults to REDCARE_IT', () => {
    const result = detectMarketplace([], 'Shop Apotheke', null);
    expect(result.marketplace).toBe('REDCARE_IT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. DetectionResult shape matches interface definition
// ─────────────────────────────────────────────────────────────────────────────
describe('DetectionResult shape', () => {
  it('tag match result has correct shape', () => {
    const result = detectMarketplace(['redcare_it'], null, null);
    expect(typeof result.marketplace).toBe('string');
    expect(typeof result.displayName).toBe('string');
    expect(typeof result.reason).toBe('string');
    expect(typeof result.color).toBe('string');
    expect(result.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('UNCLASSIFIED result has correct shape', () => {
    const result = detectMarketplace([], null, null);
    expect(typeof result.marketplace).toBe('string');
    expect(typeof result.displayName).toBe('string');
    expect(typeof result.reason).toBe('string');
    expect(typeof result.color).toBe('string');
    expect(result.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. MARKETPLACE_RULES data shape sanity checks
// ─────────────────────────────────────────────────────────────────────────────
describe('MARKETPLACE_RULES data shape', () => {
  it('every rule has a non-empty name', () => {
    for (const rule of MARKETPLACE_RULES) {
      expect(rule.name).toBeTruthy();
    }
  });

  it('every rule has a positive priority number', () => {
    for (const rule of MARKETPLACE_RULES) {
      expect(typeof rule.priority).toBe('number');
      expect(rule.priority).toBeGreaterThan(0);
    }
  });

  it('priorities are unique (no two rules share the same priority)', () => {
    const priorities = MARKETPLACE_RULES.map(r => r.priority);
    const unique = new Set(priorities);
    expect(unique.size).toBe(priorities.length);
  });

  it('all colors are valid hex strings', () => {
    for (const rule of MARKETPLACE_RULES) {
      expect(rule.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('tagPatterns, sourceNames, channelNames are arrays', () => {
    for (const rule of MARKETPLACE_RULES) {
      expect(Array.isArray(rule.tagPatterns)).toBe(true);
      expect(Array.isArray(rule.sourceNames)).toBe(true);
      expect(Array.isArray(rule.channelNames)).toBe(true);
    }
  });
});
