import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import GlobalSidebar from "./GlobalSidebar";

describe("GlobalSidebar", () => {
  it("renders the Dashboard and Ordini top-level links", () => {
    render(<GlobalSidebar />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /ordini/i })).toHaveAttribute("href", "/ordini");
  });

  it("renders the FINANCE, INVENTORY, MARKETING, SUPPORTO, ADMIN group headers", () => {
    render(<GlobalSidebar />);
    expect(screen.getByText("FINANCE")).toBeInTheDocument();
    expect(screen.getByText("INVENTORY")).toBeInTheDocument();
    expect(screen.getByText("MARKETING")).toBeInTheDocument();
    expect(screen.getByText("SUPPORTO")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("links P&L, Pagamenti, COGS, Magazzino, Prodotti, Advertising, Intelligence, Sync Center, Sicurezza to their existing unchanged URLs", () => {
    render(<GlobalSidebar />);
    expect(screen.getByRole("link", { name: "P&L" })).toHaveAttribute("href", "/amazon/pl");
    expect(screen.getByRole("link", { name: "Pagamenti" })).toHaveAttribute("href", "/amazon/payments");
    expect(screen.getByRole("link", { name: "Prodotti" })).toHaveAttribute("href", "/prodotti");
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
});
