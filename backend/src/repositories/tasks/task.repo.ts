// task.repo.ts — Repository layer for Task (bacheca / task manager module).
// Company-wide, no amazonAccountId scoping — tasks are assigned between real
// User accounts.
import type { PrismaClient, Task, TaskStatus } from "@prisma/client";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  createdById: string;
  assigneeId: string;
  dueDate?: Date | null;
}

export async function createTask(prisma: PrismaClient, input: CreateTaskInput): Promise<Task> {
  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      createdById: input.createdById,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate ?? null,
    },
  });
}

export interface ListTasksFilter {
  assigneeId?: string;
  createdById?: string;
  status?: TaskStatus;
}

export async function listTasks(prisma: PrismaClient, filter: ListTasksFilter): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      ...(filter.createdById ? { createdById: filter.createdById } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateTaskStatus(
  prisma: PrismaClient,
  params: { id: string; status: TaskStatus }
): Promise<Task> {
  return prisma.task.update({
    where: { id: params.id },
    data: {
      status: params.status,
      completedAt: params.status === "DONE" ? new Date() : null,
    },
  });
}

/** Active, non-deleted users — id + email only, for the task-assignee picker. */
export async function listActiveUsers(prisma: PrismaClient): Promise<{ id: string; email: string }[]> {
  return prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });
}
