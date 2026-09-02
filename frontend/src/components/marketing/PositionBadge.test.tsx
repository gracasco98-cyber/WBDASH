import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PositionBadge } from "./PositionBadge";

describe("PositionBadge", () => {
  it("renders a dash for null position", () => {
    render(<PositionBadge position={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("marks position 5 as the good tier (green)", () => {
    render(<PositionBadge position={5} />);
    expect(screen.getByText("#5")).toHaveClass("text-emerald-400");
  });

  it("marks position 20 as the mid tier (amber), not good", () => {
    render(<PositionBadge position={20} />);
    const el = screen.getByText("#20");
    expect(el).toHaveClass("text-amber-400");
    expect(el).not.toHaveClass("text-emerald-400");
  });

  it("marks position 21 as the bad tier (red)", () => {
    render(<PositionBadge position={21} />);
    expect(screen.getByText("#21")).toHaveClass("text-red-400");
  });
});
