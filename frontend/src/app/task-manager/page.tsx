"use client";
import { useState, useEffect, useCallback } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { Task, TaskStatus, AssignableUser } from "@/lib/api";
import { emitTaskStatusChanged } from "@/lib/taskEvents";

type Scope = "assigned" | "created";

const STATUS_LABEL: Record<TaskStatus, string> = { TODO: "Da fare", IN_PROGRESS: "In corso", DONE: "Fatto" };
const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = { TODO: "IN_PROGRESS", IN_PROGRESS: "DONE", DONE: null };
const NEXT_LABEL: Record<TaskStatus, string> = { TODO: "Inizia", IN_PROGRESS: "Segna come fatto", DONE: "" };

export default function TaskManagerPage() {
  const [scope, setScope] = useState<Scope>("assigned");
  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((s: Scope) => {
    api.tasks.list(s).then(({ tasks }) => setTasksList(tasks)).catch(() => setTasksList([]));
  }, []);

  useEffect(() => { load(scope); }, [scope, load]);
  useEffect(() => {
    api.tasks.assignableUsers().then(({ users }) => setUsers(users)).catch(() => setUsers([]));
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !assigneeId) return;
    setCreating(true);
    setError(null);
    try {
      await api.tasks.create({
        title: title.trim(), description: description.trim() || undefined,
        assigneeId, dueDate: dueDate || undefined,
      });
      setTitle(""); setDescription(""); setAssigneeId(""); setDueDate("");
      load(scope);
    } catch {
      setError("Impossibile creare il task in questo momento.");
    } finally {
      setCreating(false);
    }
  };

  const handleAdvance = async (task: Task) => {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    try {
      await api.tasks.updateStatus(task.id, next);
      emitTaskStatusChanged();
      load(scope);
    } catch {
      setError("Impossibile aggiornare il task in questo momento.");
    }
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={18} className="text-accent-primary" />
              <h1 className="text-lg sm:text-xl font-bold text-white">Task Manager</h1>
            </div>

            <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Nuovo task</h2>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo"
                  className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 sm:col-span-2"
                />
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrizione (facoltativa)"
                  className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 sm:col-span-2"
                  rows={2}
                />
                <label className="text-xs text-zinc-400 flex flex-col gap-1">
                  Assegna a
                  <select
                    aria-label="Assegna a" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                    className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="">— seleziona —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-400 flex flex-col gap-1">
                  Scadenza (facoltativa)
                  <input
                    type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="bg-bg-hover border border-bg-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                  />
                </label>
              </div>
              <button
                onClick={handleCreate}
                disabled={creating || !title.trim() || !assigneeId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 disabled:opacity-50 transition-colors"
              >
                <Plus size={13} /> Crea task
              </button>
            </div>

            <div className="flex gap-1 border-b border-bg-border">
              <button
                onClick={() => setScope("assigned")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${scope === "assigned" ? "text-accent-primary border-accent-primary" : "text-zinc-500 border-transparent hover:text-zinc-300"}`}
              >
                Assegnati a me
              </button>
              <button
                onClick={() => setScope("created")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${scope === "created" ? "text-accent-primary border-accent-primary" : "text-zinc-500 border-transparent hover:text-zinc-300"}`}
              >
                Creati da me
              </button>
            </div>

            <div className="space-y-2">
              {tasksList.map(task => (
                <div key={task.id} className="bg-bg-card border border-bg-border rounded-xl p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{task.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.status === "DONE" ? "bg-accent-primary/10 text-accent-primary" : task.status === "IN_PROGRESS" ? "bg-accent-blue/10 text-accent-blue" : "bg-bg-hover text-zinc-500"}`}>
                        {STATUS_LABEL[task.status]}
                      </span>
                    </div>
                    {task.description && <p className="text-xs text-zinc-500 mt-1">{task.description}</p>}
                    {task.dueDate && <p className="text-[11px] text-zinc-600 mt-1">Scadenza: {new Date(task.dueDate).toLocaleDateString("it-IT")}</p>}
                  </div>
                  {NEXT_STATUS[task.status] && (
                    <button
                      onClick={() => handleAdvance(task)}
                      className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary hover:bg-accent-primary/20 transition-colors"
                    >
                      {NEXT_LABEL[task.status]}
                    </button>
                  )}
                </div>
              ))}
              {tasksList.length === 0 && (
                <p className="text-sm text-zinc-600 text-center py-8">
                  {scope === "assigned" ? "Nessun task assegnato a te." : "Nessun task creato da te."}
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
