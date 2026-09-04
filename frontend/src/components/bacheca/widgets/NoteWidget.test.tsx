import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NoteWidget from "./NoteWidget";

describe("NoteWidget", () => {
  it("renders the saved text from config", () => {
    render(<NoteWidget config={{ text: "Ricorda di chiamare il fornitore" }} onConfigChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Ricorda di chiamare il fornitore");
  });

  it("starts empty when there's no saved config", () => {
    render(<NoteWidget onConfigChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("debounces saving as the user types, calling onConfigChange once typing settles", () => {
    vi.useFakeTimers();
    const onConfigChange = vi.fn();
    render(<NoteWidget onConfigChange={onConfigChange} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Nota" } });
    expect(onConfigChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(700);
    expect(onConfigChange).toHaveBeenCalledWith({ text: "Nota" });
    vi.useRealTimers();
  });
});
