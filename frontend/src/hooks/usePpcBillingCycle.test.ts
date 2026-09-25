import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ppcBillingCycleMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { amazon: { ppcBillingCycle: ppcBillingCycleMock } } }));

import { usePpcBillingCycle } from "./usePpcBillingCycle";

const cycle = (accountId: string, progressPct: number) => ({ accountId, progressPct });

describe("usePpcBillingCycle", () => {
  beforeEach(() => { ppcBillingCycleMock.mockReset(); });

  it("loads the cycles of the given account scope and exposes the most advanced one", async () => {
    ppcBillingCycleMock.mockResolvedValue({ threshold: 600, cycles: [cycle("a", 20), cycle("b", 80)] });

    const { result } = renderHook(() => usePpcBillingCycle("ALL"));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.primary?.accountId).toBe("b"));
    expect(result.current.cycles).toHaveLength(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(ppcBillingCycleMock).toHaveBeenCalledWith({ amazonAccountId: "ALL" });
  });

  it("reloads when the refresh key changes", async () => {
    ppcBillingCycleMock.mockResolvedValue({ threshold: 600, cycles: [] });

    const { rerender } = renderHook(({ key }) => usePpcBillingCycle("acc-1", key), { initialProps: { key: 0 } });
    await waitFor(() => expect(ppcBillingCycleMock).toHaveBeenCalledTimes(1));
    rerender({ key: 1 });

    await waitFor(() => expect(ppcBillingCycleMock).toHaveBeenCalledTimes(2));
  });

  it("falls back to no cycle when the request fails", async () => {
    ppcBillingCycleMock.mockRejectedValue(new Error("500"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => usePpcBillingCycle("ALL"));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(result.current.primary).toBeNull();
    expect(result.current.hasError).toBe(true);
    expect(result.current.isLoading).toBe(false);
    errorSpy.mockRestore();
  });
});
