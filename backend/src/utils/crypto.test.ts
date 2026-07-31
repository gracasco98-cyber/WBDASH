import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";
import { encryptSecret, decryptSecret } from "./crypto";

describe("encryptSecret / decryptSecret", () => {
  beforeAll(() => {
    // 32-byte key, hex-encoded (64 hex chars) — same format documented in .env.example
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });

  it("round-trips a plaintext string", () => {
    const plaintext = "Atzr|IwEBIExampleRefreshToken";
    const ciphertext = encryptSecret(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("never stores the plaintext verbatim in the ciphertext", () => {
    const plaintext = "super-secret-refresh-token";
    const ciphertext = encryptSecret(plaintext);
    expect(ciphertext).not.toContain(plaintext);
  });

  it("throws when decrypting a tampered ciphertext (auth tag mismatch)", () => {
    const ciphertext = encryptSecret("value");
    const tampered = ciphertext.slice(0, -2) + "00";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws a clear error when CREDENTIALS_ENCRYPTION_KEY is missing", () => {
    const saved = process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
    process.env.CREDENTIALS_ENCRYPTION_KEY = saved;
  });
});
