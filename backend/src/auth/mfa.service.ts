// mfa.service.ts — TOTP (RFC 6238) operations via otplib + qrcode
import { authenticator } from "otplib";
import QRCode from "qrcode";

// otplib defaults: SHA1, 30s window, 6 digits — standard for most authenticator apps
// Allow ±1 step (±30s) for clock skew
authenticator.options = { window: 1 };

const APP_NAME = "WBDASH";

// ─── Secret management ────────────────────────────────────────────────────────

/** Generate a new random Base32 TOTP secret. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret(20); // 20 bytes = 160-bit secret (RFC 4226 recommended)
}

/** Build the otpauth:// URI for QR code display. */
export function buildTotpUri(userEmail: string, secret: string): string {
  return authenticator.keyuri(userEmail, APP_NAME, secret);
}

/** Generate a base64 PNG QR code data URL from an otpauth URI. */
export async function generateQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
    color: { dark: "#ffffff", light: "#18181b" }, // white on zinc-900 background
  });
}

// ─── Verification ─────────────────────────────────────────────────────────────

/** Verify a 6-digit TOTP token against a confirmed secret. */
export function verifyTotp(token: string, secret: string): boolean {
  // Strip whitespace/dashes the user might paste
  const clean = token.replace(/[\s-]/g, "").trim();
  if (!/^\d{6}$/.test(clean)) return false;
  return authenticator.verify({ token: clean, secret });
}
