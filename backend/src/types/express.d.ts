// Augment express-session with our session data shape
import "express-session";

declare module "express-session" {
  interface SessionData {
    userId:     string;
    role:       string;   // redundant cache — source of truth always re-fetched from DB
    ip?:        string;   // client IP at login time (stored for session listing)
    ua?:        string;   // user-agent at login time
    createdAt?: string;   // ISO timestamp of login (for session listing UI)
    // ── MFA pending state (set after password OK, cleared after TOTP verified) ──
    mfaPending?: {
      userId:    string;
      role:      string;
      expiresAt: number; // Date.now() + 5 min
    };
    // ── New device setup pending (temporary secret while user scans QR) ────────
    mfaDevicePending?: {
      secret: string;
    };
  }
}

// Augment Express Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id:         string;
        email:      string;
        role:       string;
        isActive:   boolean;
        mfaEnabled: boolean;
      };
    }
  }
}

export {};
