import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PositionSparkline } from "./PositionSparkline";
import type { MarketingKeywordSnapshot } from "@/lib/api";

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

function snap(position: number | null, checkedAt: string): MarketingKeywordSnapshot {
  return {
    id: `s-${checkedAt}`, watchId: "w1", checkedAt, found: position !== null, position, nbHits: 10,
    price: null, sellerName: null, productName: null, promoted: null, promotedByReRanking: null,
  };
}

describe("PositionSparkline", () => {
  it("shows a dash placeholder when there are fewer than 2 positioned snapshots", () => {
    render(<PositionSparkline snapshots={[snap(3, "2026-09-01T00:00:00Z")]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a dash placeholder when snapshots is empty or undefined", () => {
    render(<PositionSparkline snapshots={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("ignores not-found snapshots when counting positioned points", () => {
    render(<PositionSparkline snapshots={[snap(null, "2026-09-01T00:00:00Z"), snap(3, "2026-09-02T00:00:00Z")]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a trend chart when there are 2+ positioned snapshots", () => {
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 64, height: 24, top: 0, left: 0, right: 64, bottom: 24, x: 0, y: 0,
      toJSON() { return this; },
    } as DOMRect);

    const { container } = render(
      <PositionSparkline snapshots={[snap(5, "2026-09-01T00:00:00Z"), snap(2, "2026-09-02T00:00:00Z")]} />
    );
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();

    rectSpy.mockRestore();
  });
});
