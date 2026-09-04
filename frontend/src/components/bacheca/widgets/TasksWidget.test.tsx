import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TasksWidget from "./TasksWidget";

const mockList = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { tasks: { list: (scope?: string) => mockList(scope), updateStatus: (id: string, status: string) => mockUpdateStatus(id, status) } },
}));

function task(overrides: Partial<{ id: string; title: string; status: string }> = {}) {
  return {
    id: "t1", title: "Controlla scadenza IVA", description: null, status: "TODO",
    createdById: "bob", assigneeId: "alice", dueDate: null, completedAt: null,
    createdAt: "2026-09-04T00:00:00Z", updatedAt: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

describe("TasksWidget", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockUpdateStatus.mockReset();
    mockUpdateStatus.mockResolvedValue({});
  });

  it("shows tasks assigned to the current user, not yet done", async () => {
    mockList.mockResolvedValue({ tasks: [task()] });
    render(<TasksWidget />);
    expect(await screen.findByText("Controlla scadenza IVA")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith("assigned");
  });

  it("shows an empty state when there are no open tasks", async () => {
    mockList.mockResolvedValue({ tasks: [] });
    render(<TasksWidget />);
    expect(await screen.findByText(/nessun task/i)).toBeInTheDocument();
  });

  it("marks a task as done from the widget", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue({ tasks: [task()] });
    render(<TasksWidget />);
    await screen.findByText("Controlla scadenza IVA");

    await user.click(screen.getByRole("checkbox", { name: /completa/i }));
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith("t1", "DONE"));
  });

  it("links to the full Task Manager page", async () => {
    mockList.mockResolvedValue({ tasks: [] });
    render(<TasksWidget />);
    await screen.findByText(/nessun task/i);
    expect(screen.getByRole("link", { name: /vedi tutti/i })).toHaveAttribute("href", "/task-manager");
  });
});
