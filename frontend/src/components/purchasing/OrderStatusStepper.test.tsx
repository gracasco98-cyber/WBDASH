import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OrderStatusStepper from "./OrderStatusStepper";

describe("OrderStatusStepper", () => {
  it("renders all 7 step labels", () => {
    render(<OrderStatusStepper logisticStatus="DRAFT" />);
    for (const label of ["Bozza", "Inviato", "Confermato", "In produzione", "Pronto", "Spedito", "Ricevuto"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows a cancelled banner instead of the stepper for CANCELLED", () => {
    render(<OrderStatusStepper logisticStatus="CANCELLED" />);
    expect(screen.getByText("Ordine annullato")).toBeInTheDocument();
    expect(screen.queryByText("Bozza")).not.toBeInTheDocument();
  });

  it("marks PARTIALLY_SHIPPED as the active 'Spedito' step with a 'parziale' badge", () => {
    render(<OrderStatusStepper logisticStatus="PARTIALLY_SHIPPED" />);
    expect(screen.getByText("Spedito").className).toMatch(/text-accent-blue/);
    expect(screen.getByText("parziale")).toBeInTheDocument();
  });

  it("marks steps before the active one as done (green) and after as future (grey)", () => {
    render(<OrderStatusStepper logisticStatus="CONFIRMED" />);
    expect(screen.getByText("Bozza").className).toMatch(/text-accent-primary/);
    expect(screen.getByText("Inviato").className).toMatch(/text-accent-primary/);
    expect(screen.getByText("Confermato").className).toMatch(/text-accent-blue/);
    expect(screen.getByText("In produzione").className).toMatch(/text-zinc-600/);
  });

  it("does not show a 'parziale' badge for a full (non-partial) status", () => {
    render(<OrderStatusStepper logisticStatus="RECEIVED" />);
    expect(screen.queryByText("parziale")).not.toBeInTheDocument();
    expect(screen.getByText("Ricevuto").className).toMatch(/text-accent-blue/);
  });

  it("maps PARTIALLY_RECEIVED and COMPLETED onto the same 'Ricevuto' step as RECEIVED", () => {
    const { rerender } = render(<OrderStatusStepper logisticStatus="PARTIALLY_RECEIVED" />);
    expect(screen.getByText("Ricevuto").className).toMatch(/text-accent-blue/);
    rerender(<OrderStatusStepper logisticStatus="COMPLETED" />);
    expect(screen.getByText("Ricevuto").className).toMatch(/text-accent-blue/);
  });
});
