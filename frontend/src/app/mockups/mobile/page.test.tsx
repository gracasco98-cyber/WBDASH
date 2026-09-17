import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MobileDashboardMockup from "./page";

describe("MobileDashboardMockup", () => {
  it("promotes sold units to a primary operational metric", () => {
    render(<MobileDashboardMockup />);

    expect(screen.getAllByText("Unità vendute").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("302 pz")).toBeInTheDocument();
    expect(screen.getByText("Pezzi / ordine")).toBeInTheDocument();
    expect(screen.getByText("1,10")).toBeInTheDocument();
  });

  it("keeps units visible in the Intelligence view and period comparison", () => {
    render(<MobileDashboardMockup />);

    fireEvent.click(screen.getByRole("button", { name: /intelligence/i }));

    expect(screen.getByText("Intelligence di oggi")).toBeInTheDocument();
    expect(screen.getByText("Unità vendute")).toBeInTheDocument();
    expect(screen.getByText("302 pz")).toBeInTheDocument();
    expect(screen.getAllByText("302 pz venduti")).toHaveLength(2);
    expect(screen.getByText("1.230 pz venduti")).toBeInTheDocument();
  });

  it("shows the preferred Tiles product drill-down with every field", () => {
    render(<MobileDashboardMockup />);

    const collagen = screen.getByRole("button", { name: /collagenaid 120/i });
    expect(collagen).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Ads").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("ACOS reale").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Fee marketplace")).toBeInTheDocument();
    expect(screen.getByText("COLL-120-IT")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /biotina 360/i }));
    expect(screen.getByText("BIO-360-IT")).toBeInTheDocument();
    expect(collagen).toHaveAttribute("aria-expanded", "false");
  });
});
