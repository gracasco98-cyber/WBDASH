// Global test setup. Estensioni Vitest qui se servono.
// Per ora minimal: solo logging on/off via env.
import { beforeAll, afterAll } from 'vitest';

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
