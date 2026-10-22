import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CalcExplainPopover from "./CalcExplainPopover";
import type { Explain } from "@/lib/periodTileExplain";

const explain: Explain = {
  title: "Margine pulito",
  intro: "Quello che resta in tasca.",
  lines: [
    { label: "Incasso", amount: 1000 },
    { label: "Fee Amazon", amount: -300, estimated: true, note: "stima 15% + 3,80 €/pz" },
    { label: "di cui IVA", amount: 90, info: true },
  ],
  total: { label: "Margine pulito", amount: 700, note: "70% dell'incasso" },
};

describe("CalcExplainPopover", () => {
  it("opens the breakdown on click without triggering the parent tile", () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <CalcExplainPopover explain={explain}><span>Margine</span></CalcExplainPopover>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /come è calcolato: margine pulito/i }));
    const dialog = screen.getByRole("dialog", { name: "Margine pulito" });
    expect(dialog).toHaveTextContent("Fee Amazon");
    expect(dialog).toHaveTextContent("€ -300,00");
    expect(dialog).toHaveTextContent("≈");
    expect(dialog).toHaveTextContent("70% dell'incasso");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("opens with the keyboard and closes with Escape", () => {
    render(<CalcExplainPopover explain={explain}><span>Margine</span></CalcExplainPopover>);
    const trigger = screen.getByRole("button", { name: /come è calcolato/i });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", () => {
    render(<div><p>fuori</p><CalcExplainPopover explain={explain}><span>Margine</span></CalcExplainPopover></div>);
    fireEvent.click(screen.getByRole("button", { name: /come è calcolato/i }));
    fireEvent.mouseDown(screen.getByText("fuori"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
