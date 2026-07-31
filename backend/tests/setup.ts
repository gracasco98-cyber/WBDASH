// Global test setup. Estensioni Vitest qui se servono.
// Per ora minimal: solo logging on/off via env.
import { beforeAll, afterAll } from 'vitest';

// Fixed 64-hex-char (32-byte) test key for utils/crypto.ts's AES-256-GCM
// encrypt/decrypt of AmazonAccount credential fields (multi-account migration,
// 2026-07-31). Set at module top-level (not inside beforeAll) so it's already
// present before any test file's dynamic imports / helper calls that encrypt
// credentials via createTestAmazonAccount(). Not a real secret — test-only.
if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);
}

beforeAll(() => {
  // Silenzia logger nei test, salva orig per ripristino
  if (!process.env.TEST_VERBOSE) {
    // eslint-disable-next-line no-console
    console.log = () => undefined;
  }
});

afterAll(() => {
  // Niente per ora
});
