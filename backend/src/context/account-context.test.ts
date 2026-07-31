import { describe, it, expect } from "vitest";
import { runWithAccount, getCurrentAccountId } from "./account-context";

describe("account-context", () => {
  it("returns the accountId set by runWithAccount inside its callback", async () => {
    const result = await runWithAccount("acc-123", async () => {
      return getCurrentAccountId();
    });
    expect(result).toBe("acc-123");
  });

  it("throws when read outside of any runWithAccount scope", () => {
    expect(() => getCurrentAccountId()).toThrow(/no Amazon account/i);
  });

  it("isolates concurrent scopes from each other", async () => {
    const [a, b] = await Promise.all([
      runWithAccount("acc-A", async () => {
        await new Promise((r) => setTimeout(r, 20));
        return getCurrentAccountId();
      }),
      runWithAccount("acc-B", async () => {
        return getCurrentAccountId();
      }),
    ]);
    expect(a).toBe("acc-A");
    expect(b).toBe("acc-B");
  });

  it("propagates into nested async calls within the same scope", async () => {
    async function inner() {
      return getCurrentAccountId();
    }
    const result = await runWithAccount("acc-nested", async () => inner());
    expect(result).toBe("acc-nested");
  });
});
