import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// tailwind.config.js consumes these tokens as `rgb(var(--accent-x-rgb) / <alpha-value>)`.
// That slash syntax is only valid with space-separated channels: with commas
// the browser drops every text-/bg-/border-accent-* declaration.
const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const tokens = [...css.matchAll(/(--accent-[a-z]+-rgb):\s*([^;]+);/g)];

describe("accent theme tokens", () => {
  it("defines the five accents for both themes", () => {
    expect(tokens).toHaveLength(10);
  });

  it("uses space-separated channels so rgb(var(--token) / alpha) stays valid CSS", () => {
    for (const [, name, value] of tokens) {
      expect(value.trim(), name).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
  });
});
