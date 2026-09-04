import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
  usePathname: vi.fn(() => "/"),
}));

vi.mock("@/hooks/useAmazonAccount", () => ({
  useAmazonAccount: () => ({
    accounts: [{ id: "a1", name: "Account Test", sellerId: "S1", region: "EU" }],
    selectedAccountId: "a1", needsSelection: false, loading: false, selectAccount: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMarketplaceFilter", () => ({
  useMarketplaceFilter: () => ({ marketplace: "all", setMarketplace: vi.fn() }),
}));

const mockList = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { tasks: { list: (scope?: string) => mockList(scope) } },
}));

let sseHandler: ((event: string, data: unknown) => void) | null = null;
vi.mock("@/hooks/useSSE", () => ({
  useSSE: (onMessage: (event: string, data: unknown) => void) => { sseHandler = onMessage; },
}));

import AppHeader from "./AppHeader";
import { emitTaskStatusChanged } from "@/lib/taskEvents";

function task(status: string, id = "t1") {
  return { id, title: "Task", description: null, status, createdById: "bob", assigneeId: "alice", dueDate: null, completedAt: null, createdAt: "", updatedAt: "" };
}

describe("AppHeader — task notification bell", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockList.mockReset();
    mockList.mockResolvedValue({ tasks: [] });
    sseHandler = null;
  });

  it("shows the count of open (non-DONE) tasks assigned to the user", async () => {
    mockList.mockResolvedValue({ tasks: [task("TODO", "t1"), task("IN_PROGRESS", "t2"), task("DONE", "t3")] });
    render(<AppHeader />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(mockList).toHaveBeenCalledWith("assigned");
  });

  it("refetches the count when a task:assigned SSE event arrives", async () => {
    mockList.mockResolvedValueOnce({ tasks: [] }).mockResolvedValueOnce({ tasks: [task("TODO")] });
    render(<AppHeader />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    sseHandler?.("task:assigned", { taskId: "t1", title: "Nuovo task" });

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("navigates to /task-manager on bell click when no onNotificationClick is given", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);
    await user.click(screen.getByRole("button", { name: /notifiche/i }));
    expect(mockPush).toHaveBeenCalledWith("/task-manager");
  });

  it("calls the provided onNotificationClick instead of navigating, when given", async () => {
    const user = userEvent.setup();
    const onNotificationClick = vi.fn();
    render(<AppHeader onNotificationClick={onNotificationClick} />);
    await user.click(screen.getByRole("button", { name: /notifiche/i }));
    expect(onNotificationClick).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalledWith("/task-manager");
  });

  it("combines the page-supplied notificationCount with the open task count in the badge", async () => {
    mockList.mockResolvedValue({ tasks: [task("TODO")] });
    render(<AppHeader notificationCount={3} />);
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
  });

  it("refetches the count when a task status changes locally (e.g. completed from Task Manager)", async () => {
    mockList.mockResolvedValueOnce({ tasks: [] }).mockResolvedValueOnce({ tasks: [task("TODO")] });
    render(<AppHeader />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    emitTaskStatusChanged();

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
