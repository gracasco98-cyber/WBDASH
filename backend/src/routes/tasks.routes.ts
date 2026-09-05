// tasks.routes.ts — Task manager module (bacheca). Company-wide, tasks are
// assigned between real User accounts.
import { Router, Request, Response } from "express";
import type { TaskStatus } from "@prisma/client";
import { prisma } from "../db";
import { createTask, listTasks, updateTaskStatus, listActiveUsers } from "../repositories/tasks/task.repo";
import { broadcastToUser } from "../sse/sse";
import { logError } from "../services/shopify.service";

export const tasksRouter = Router();

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

tasksRouter.get("/assignable-users", async (_req: Request, res: Response) => {
  try {
    const users = await listActiveUsers(prisma);
    res.json({ users });
  } catch (err) {
    await logError("tasks-assignable-users", err);
    res.status(500).json({ error: "Impossibile recuperare gli utenti." });
  }
});

tasksRouter.get("/", async (req: Request, res: Response) => {
  const scope = req.query.scope === "created" ? "created" : "assigned";
  try {
    const tasks = scope === "created"
      ? await listTasks(prisma, { createdById: req.user!.id })
      : await listTasks(prisma, { assigneeId: req.user!.id });
    res.json({ tasks });
  } catch (err) {
    await logError("tasks-list", err);
    res.status(500).json({ error: "Impossibile recuperare i task." });
  }
});

tasksRouter.post("/", async (req: Request, res: Response) => {
  const { title, description, assigneeId, dueDate, relatedType, relatedLabel, relatedUrl } = req.body as {
    title?: string; description?: string; assigneeId?: string; dueDate?: string;
    relatedType?: string; relatedLabel?: string; relatedUrl?: string;
  };
  if (!title || !title.trim()) return res.status(400).json({ error: "title è obbligatorio." });
  if (!assigneeId) return res.status(400).json({ error: "assigneeId è obbligatorio." });

  try {
    const task = await createTask(prisma, {
      title: title.trim(),
      description: description?.trim() || null,
      createdById: req.user!.id,
      assigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
      relatedType: relatedType?.trim() || null,
      relatedLabel: relatedLabel?.trim() || null,
      relatedUrl: relatedUrl?.trim() || null,
    });
    if (task.assigneeId !== task.createdById) {
      broadcastToUser(task.assigneeId, "task:assigned", { taskId: task.id, title: task.title });
    }
    res.status(201).json(task);
  } catch (err) {
    await logError("tasks-create", err);
    res.status(500).json({ error: "Impossibile creare il task." });
  }
});

tasksRouter.patch("/:id/status", async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!status || !VALID_STATUSES.includes(status as TaskStatus)) {
    return res.status(400).json({ error: "status non valido." });
  }
  try {
    const task = await updateTaskStatus(prisma, { id: req.params.id, status: status as TaskStatus });
    res.json(task);
  } catch (err) {
    await logError("tasks-update-status", err, { taskId: req.params.id });
    res.status(500).json({ error: "Impossibile aggiornare lo stato del task." });
  }
});
