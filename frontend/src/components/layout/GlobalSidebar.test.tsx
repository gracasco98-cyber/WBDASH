import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

import GlobalSidebar from "./GlobalSidebar";

describe("GlobalSidebar", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/");
  });

  it("renders the Dashboard and Ordini top-level links", () => {
    render(<GlobalSidebar />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/");
    // Exact match (not /ordini/i) — the INVENTORY group's "Ordini Fornitore"
    // link also contains "Ordini" as a substring, so a case-insensitive
    // substring regex matches both this top-level link and that one.
    expect(screen.getByRole("link", { name: "Ordini" })).toHaveAttribute("href", "/ordini");
  });

  it("renders the FINANCE, INVENTORY, MARKETING, SUPPORTO, ADMIN group headers", () => {
    render(<GlobalSidebar />);
    expect(screen.getByText("FINANCE")).toBeInTheDocument();
    expect(screen.getByText("INVENTORY")).toBeInTheDocument();
    expect(screen.getByText("MARKETING")).toBeInTheDocument();
    expect(screen.getByText("SUPPORTO")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("links P&L, Pagamenti, COGS, Magazzino, Advertising, Intelligence, Sync Center, Sicurezza to their existing unchanged URLs", () => {
    render(<GlobalSidebar />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/amazon");
    expect(screen.getByRole("link", { name: "P&L" })).toHaveAttribute("href", "/amazon/pl");
    expect(screen.getByRole("link", { name: "Pagamenti" })).toHaveAttribute("href", "/amazon/payments");
    expect(screen.getByRole("link", { name: "COGS" })).toHaveAttribute("href", "/amazon/cogs");
    expect(screen.getByRole("link", { name: "Magazzino" })).toHaveAttribute("href", "/amazon/inventory");
    expect(screen.getByRole("link", { name: /advertising/i })).toHaveAttribute("href", "/amazon/ppc");
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("href", "/amazon/analytics");
    expect(screen.getByRole("link", { name: "Sync Center" })).toHaveAttribute("href", "/amazon/sync");
    expect(screen.getByRole("link", { name: "Sicurezza" })).toHaveAttribute("href", "/account/security");
    expect(screen.getByRole("link", { name: /gestione utenti/i })).toHaveAttribute("href", "/admin");
  });

  it("renders 'Prossimamente' items as disabled, non-navigating", () => {
    render(<GlobalSidebar />);
    const fisco = screen.getByText("Fisco").closest("button, a");
    expect(fisco?.tagName).toBe("BUTTON");
    expect(fisco).toBeDisabled();
  });

  it("does not mark Overview (/amazon) active on a sibling /amazon/* subpage, since those routes now live in other groups", () => {
    vi.mocked(usePathname).mockReturnValue("/amazon/pl");
    render(<GlobalSidebar />);
    const overviewLink = screen.getByRole("link", { name: "Overview" });
    expect(overviewLink.className).not.toMatch(/text-accent-primary/);
    const plLink = screen.getByRole("link", { name: "P&L" });
    expect(plLink.className).toMatch(/text-accent-primary/);
  });
});
