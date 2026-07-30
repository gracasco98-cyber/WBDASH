// lib/marketplace-rules-client.ts
// Copia client-side delle regole — usata solo per la UI admin.
// Le regole vere si trovano in backend/src/config/marketplace-rules.ts

export const MARKETPLACE_RULES = [
  { name: "REDCARE_IT",  displayName: "Redcare IT",  priority: 10, tagPatterns: ["redcare_it","redcare-it","redcareit","redcare it"],  color: "#ef4444" },
  { name: "REDCARE_DE",  displayName: "Redcare DE",  priority: 11, tagPatterns: ["redcare_de","redcare-de","redcaerde","redcare de"],  color: "#dc2626" },
  { name: "TEMU_IT",     displayName: "Temu IT",     priority: 20, tagPatterns: ["temu_it","temu-it","temuit","temu it"],              color: "#f97316" },
  { name: "TEMU_ES",     displayName: "Temu ES",     priority: 21, tagPatterns: ["temu_es","temu-es","temues","temu es"],              color: "#fb923c" },
  { name: "TEMU_FR",     displayName: "Temu FR",     priority: 22, tagPatterns: ["temu_fr","temu-fr","temufr","temu fr"],              color: "#fbbf24" },
  { name: "TEMU_DE",     displayName: "Temu DE",     priority: 23, tagPatterns: ["temu_de","temu-de","temude","temu de"],              color: "#f59e0b" },
  { name: "EBAY",        displayName: "eBay",        priority: 30, tagPatterns: ["ebay","e-bay","e_bay"],                              color: "#3b82f6" },
  { name: "BENU_FARMA",  displayName: "Benu Farma",  priority: 40, tagPatterns: ["benu farma","benu_farma","benu-farma","benu"],       color: "#10b981" },
  { name: "TIKTOK",      displayName: "TikTok",      priority: 50, tagPatterns: ["tiktok","tik tok","tik_tok","tik-tok"],             color: "#a78bfa" },
];
