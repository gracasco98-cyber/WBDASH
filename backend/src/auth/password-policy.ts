// password-policy.ts — configurable password rules per role
// All thresholds are overridable via environment variables.

export interface PasswordPolicy {
  minLength:        number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber:    boolean;
  requireSymbol:    boolean;
}

// ─── Policy definitions ───────────────────────────────────────────────────────

// Standard users — baseline policy
const USER_POLICY: PasswordPolicy = {
  minLength:        parseInt(process.env.PASSWORD_MIN_LENGTH        ?? "8"),
  requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE          !== "false",
  requireLowercase: true,
  requireNumber:    process.env.PASSWORD_REQUIRE_NUMBER             !== "false",
  requireSymbol:    process.env.PASSWORD_REQUIRE_SYMBOL             === "true",
};

// Elevated roles (admin / master) — stricter policy
const ELEVATED_POLICY: PasswordPolicy = {
  minLength:        parseInt(process.env.PASSWORD_ADMIN_MIN_LENGTH  ?? "12"),
  requireUppercase: true,
  requireLowercase: true,
  requireNumber:    true,
  requireSymbol:    process.env.PASSWORD_ADMIN_REQUIRE_SYMBOL       !== "false",
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function getPolicyForRole(role: string): PasswordPolicy {
  return ["admin", "master"].includes(role) ? ELEVATED_POLICY : USER_POLICY;
}

export function validatePassword(
  password: string,
  policy:   PasswordPolicy
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < policy.minLength)
    errors.push(`Almeno ${policy.minLength} caratteri`);

  if (policy.requireUppercase && !/[A-Z]/.test(password))
    errors.push("Almeno una lettera maiuscola (A-Z)");

  if (policy.requireLowercase && !/[a-z]/.test(password))
    errors.push("Almeno una lettera minuscola (a-z)");

  if (policy.requireNumber && !/[0-9]/.test(password))
    errors.push("Almeno un numero (0-9)");

  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password))
    errors.push("Almeno un carattere speciale (!@#$…)");

  return { valid: errors.length === 0, errors };
}

/** Human-readable description of a policy (for frontend hints). */
export function describePolicyForRole(role: string): string[] {
  const p = getPolicyForRole(role);
  const rules: string[] = [`Minimo ${p.minLength} caratteri`];
  if (p.requireUppercase) rules.push("Almeno una maiuscola");
  if (p.requireLowercase) rules.push("Almeno una minuscola");
  if (p.requireNumber)    rules.push("Almeno un numero");
  if (p.requireSymbol)    rules.push("Almeno un carattere speciale");
  return rules;
}
