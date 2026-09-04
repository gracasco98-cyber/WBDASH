// lib/api/tasks.ts — Task Manager (bacheca): task assignment between users.
import { apiUrl, get } from "./client";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdById: string;
  assigneeId: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignableUser {
  id: string;
  email: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const tasks = {
  list: (scope?: "assigned" | "created") => get<{ tasks: Task[] }>("/api/tasks", scope ? { scope } : undefined),
  assignableUsers: () => get<{ users: AssignableUser[] }>("/api/tasks/assignable-users"),
  create: (data: { title: string; description?: string; assigneeId: string; dueDate?: string }) =>
    post<Task>("/api/tasks", data),
  updateStatus: (id: string, status: TaskStatus) => patch<Task>(`/api/tasks/${id}/status`, { status }),
};
