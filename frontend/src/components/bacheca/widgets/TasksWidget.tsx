"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Task } from "@/lib/api";

export default function TasksWidget() {
  const [openTasks, setOpenTasks] = useState<Task[]>([]);

  const load = useCallback(() => {
    api.tasks.list("assigned").then(({ tasks }) => setOpenTasks(tasks.filter(t => t.status !== "DONE")));
  }, []);
  useEffect(() => { load(); }, [load]);

  const complete = async (id: string) => {
    await api.tasks.updateStatus(id, "DONE");
    load();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {openTasks.slice(0, 6).map(task => (
          <label key={task.id} className="flex items-start gap-2 text-xs text-amber-950/80 cursor-pointer">
            <input
              type="checkbox" aria-label={`Completa ${task.title}`}
              onChange={() => complete(task.id)}
              className="mt-0.5 shrink-0"
            />
            <span className="leading-snug">{task.title}</span>
          </label>
        ))}
        {openTasks.length === 0 && <p className="text-xs text-amber-950/50">Nessun task da fare 🎉</p>}
      </div>
      <Link href="/task-manager" className="text-[11px] text-amber-900 underline underline-offset-2 mt-2 self-start">
        Vedi tutti →
      </Link>
    </div>
  );
}
