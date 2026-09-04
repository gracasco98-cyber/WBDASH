import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BachecaBoard from "./BachecaBoard";

const mockGetLayout = vi.fn();
const mockSaveLayout = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { board: { getLayout: () => mockGetLayout(), saveLayout: (l: unknown) => mockSaveLayout(l) } },
}));

// Real widget components fetch their own data via api calls we haven't
// mocked — the board container's own add/remove/persist logic is what this
// file tests, not each widget's internals (those have their own test files).
vi.mock("./widgetRegistry", () => ({
  WIDGET_REGISTRY: [
    { type: "tasks", label: "I miei task", defaultSize: { w: 3, h: 3 }, render: () => "TASKS_WIDGET_CONTENT" },
    { type: "note", label: "Nota veloce", defaultSize: { w: 3, h: 3 }, render: () => "NOTE_WIDGET_CONTENT" },
  ],
  widgetDef: (type: string) => [
    { type: "tasks", label: "I miei task", defaultSize: { w: 3, h: 3 }, render: () => "TASKS_WIDGET_CONTENT" },
    { type: "note", label: "Nota veloce", defaultSize: { w: 3, h: 3 }, render: () => "NOTE_WIDGET_CONTENT" },
  ].find(w => w.type === type),
}));

describe("BachecaBoard", () => {
  beforeEach(() => {
    mockGetLayout.mockReset();
    mockSaveLayout.mockReset();
    mockSaveLayout.mockResolvedValue(undefined);
  });

  it("renders the saved widgets from the persisted layout", async () => {
    mockGetLayout.mockResolvedValue({ layout: [{ i: "w1", type: "tasks", x: 0, y: 0, w: 3, h: 3 }] });
    render(<BachecaBoard />);
    expect(await screen.findByText("I miei task")).toBeInTheDocument();
    expect(screen.getByText("TASKS_WIDGET_CONTENT")).toBeInTheDocument();
  });

  it("shows an empty-board prompt when there are no widgets yet", async () => {
    mockGetLayout.mockResolvedValue({ layout: [] });
    render(<BachecaBoard />);
    expect(await screen.findByText(/bacheca vuota/i)).toBeInTheDocument();
  });

  it("adds a widget from the picker and saves the new layout", async () => {
    const user = userEvent.setup();
    mockGetLayout.mockResolvedValue({ layout: [] });
    render(<BachecaBoard />);
    await screen.findByText(/bacheca vuota/i);

    await user.click(screen.getByRole("button", { name: /aggiungi widget/i }));
    await user.click(screen.getByRole("button", { name: "Nota veloce" }));

    expect(await screen.findByText("NOTE_WIDGET_CONTENT")).toBeInTheDocument();
    await waitFor(() => expect(mockSaveLayout).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: "note" })])
    ));
  });

  it("removes a widget and saves the updated layout", async () => {
    const user = userEvent.setup();
    mockGetLayout.mockResolvedValue({ layout: [{ i: "w1", type: "tasks", x: 0, y: 0, w: 3, h: 3 }] });
    render(<BachecaBoard />);
    await screen.findByText("TASKS_WIDGET_CONTENT");

    await user.click(screen.getByRole("button", { name: /rimuovi i miei task/i }));

    await waitFor(() => expect(screen.queryByText("TASKS_WIDGET_CONTENT")).not.toBeInTheDocument());
    expect(mockSaveLayout).toHaveBeenCalledWith([]);
  });
});
