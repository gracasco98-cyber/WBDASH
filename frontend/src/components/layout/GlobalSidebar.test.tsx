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
    // Exact match (not /ordini/i) — the GESTIONALE group's "Ordini
    // Fornitore" link also contains "Ordini" as a substring, so a
    // case-insensitive substring regex matches both this top-level link and
    // that one.
    expect(screen.getByRole("link", { name: "Ordini" })).toHaveAttribute("href", "/ordini");
  });

  it("renders the Bacheca and Task Manager top-level links", () => {
    render(<GlobalSidebar />);
    expect(screen.getByRole("link", { name: /bacheca/i })).toHaveAttribute("href", "/bacheca");
    expect(screen.getByRole("link", { name: /task manager/i })).toHaveAttribute("href", "/task-manager");
  });

  it("renders the operational group headers without the temporary Finance group", () => {
    render(<GlobalSidebar />);
    expect(screen.queryByText("FINANCE")).not.toBeInTheDocument();
    expect(screen.getByText("INVENTORY")).toBeInTheDocument();
    expect(screen.getByText("MARKETING")).toBeInTheDocument();
    expect(screen.getByText("SUPPORTO")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("renders the GESTIONALE group with a Panoramica link to /acquisti", () => {
    render(<GlobalSidebar />);
    expect(screen.getByText("GESTIONALE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panoramica" })).toHaveAttribute("href", "/acquisti");
  });

  it("links operational areas to their existing URLs", () => {
    render(<GlobalSidebar />);
    expect(screen.getByRole("link", { name: "COGS" })).toHaveAttribute("href", "/amazon/cogs");
    expect(screen.getByRole("link", { name: "Magazzino" })).toHaveAttribute("href", "/amazon/inventory");
    expect(screen.getByRole("link", { name: /advertising/i })).toHaveAttribute("href", "/amazon/ppc");
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("href", "/amazon/analytics");
    expect(screen.getByRole("link", { name: "Sync Center" })).toHaveAttribute("href", "/amazon/sync");
    expect(screen.getByRole("link", { name: "Sicurezza" })).toHaveAttribute("href", "/account/security");
    expect(screen.getByRole("link", { name: /gestione utenti/i })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Prima Nota" })).toHaveAttribute("href", "/acquisti/prima-nota");
    expect(screen.queryByRole("link", { name: "P&L" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pagamenti" })).not.toBeInTheDocument();
  });

  it("renders 'Prossimamente' items as disabled, non-navigating", () => {
    render(<GlobalSidebar />);
    expect(screen.queryByText("Content Hub")).not.toBeInTheDocument();
    expect(screen.queryByText("Calendario promo")).not.toBeInTheDocument();
    const supplierInvoices = screen.getByText("Fatture Fornitore").closest("button, a");
    expect(supplierInvoices?.tagName).toBe("BUTTON");
    expect(supplierInvoices).toBeDisabled();
  });

  it("adds the Redcare Keyword BI link to the MARKETING group", () => {
    render(<GlobalSidebar />);
    expect(screen.getByRole("link", { name: /redcare keyword bi/i })).toHaveAttribute("href", "/marketing/redcare");
  });
});
