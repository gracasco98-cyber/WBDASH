import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── next/navigation ── AppHeader (useRouter) and GlobalSidebar (usePathname)
// aren't safe to render outside a real Next.js router context — mocked the
// same way as src/app/page.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/task-manager"),
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

import TaskManagerPage from "./page";

const mockList = vi.fn();
const mockAssignableUsers = vi.fn();
const mockCreate = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    tasks: {
      list: (scope?: string) => mockList(scope),
      assignableUsers: () => mockAssignableUsers(),
      create: (data: unknown) => mockCreate(data),
      updateStatus: (id: string, status: string) => mockUpdateStatus(id, status),
    },
  },
}));

const TASK_ASSIGNED_TO_ME = {
  id: "t1", title: "Controlla scadenza IVA", description: "Verifica il pagamento di settembre",
  status: "TODO", createdById: "bob", assigneeId: "alice", dueDate: null, completedAt: null,
  createdAt: "2026-09-04T00:00:00Z", updatedAt: "2026-09-04T00:00:00Z",
};

describe("TaskManagerPage", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockAssignableUsers.mockReset();
    mockCreate.mockReset();
    mockUpdateStatus.mockReset();
    mockList.mockResolvedValue({ tasks: [] });
    mockAssignableUsers.mockResolvedValue({ users: [{ id: "bob", email: "bob@example.com" }] });
    mockCreate.mockResolvedValue({});
    mockUpdateStatus.mockResolvedValue({});
  });

  it("loads tasks assigned to me by default", async () => {
    mockList.mockResolvedValueOnce({ tasks: [TASK_ASSIGNED_TO_ME] });
    render(<TaskManagerPage />);
    expect(await screen.findByText("Controlla scadenza IVA")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith("assigned");
  });

  it("switches to tasks created by me on tab click", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce({ tasks: [] }).mockResolvedValueOnce({ tasks: [TASK_ASSIGNED_TO_ME] });
    render(<TaskManagerPage />);
    await user.click(screen.getByRole("button", { name: /creati da me/i }));
    await waitFor(() => expect(mockList).toHaveBeenCalledWith("created"));
  });

  it("creates a new task assigned to a colleague", async () => {
    const user = userEvent.setup();
    render(<TaskManagerPage />);
    await screen.findByText(/bob@example\.com/i);

    await user.type(screen.getByPlaceholderText(/titolo/i), "Nuovo task");
    await user.selectOptions(screen.getByLabelText(/assegna a/i), "bob");
    await user.click(screen.getByRole("button", { name: /crea task/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ title: "Nuovo task", assigneeId: "bob" })));
  });

  it("updates a task's status from the list", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce({ tasks: [{ ...TASK_ASSIGNED_TO_ME, status: "IN_PROGRESS" }] });
    render(<TaskManagerPage />);
    await screen.findByText("Controlla scadenza IVA");

    await user.click(screen.getByRole("button", { name: /segna come fatto/i }));
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith("t1", "DONE"));
  });

  it("shows an empty state when there are no tasks", async () => {
    render(<TaskManagerPage />);
    expect(await screen.findByText(/nessun task/i)).toBeInTheDocument();
  });
});
