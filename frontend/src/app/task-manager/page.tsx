"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Filter,
  LayoutGrid,
  ListTodo,
  MessageSquare,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  X,
  Clock3,
} from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import { api } from "@/lib/api";
import type { Task, TaskStatus, AssignableUser } from "@/lib/api";
import { emitTaskStatusChanged } from "@/lib/taskEvents";

type Scope = "assigned" | "created";
const STATUS: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Da fare",
  IN_PROGRESS: "In corso",
  DONE: "Completati",
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: "text-accent-amber bg-accent-amber/10",
  IN_PROGRESS: "text-accent-blue bg-accent-blue/10",
  DONE: "text-accent-primary bg-accent-primary/10",
};
const MODULES = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "KPI e andamento vendite",
    href: "/",
    icon: LayoutGrid,
    color: "text-accent-blue",
  },
  {
    id: "prima-nota",
    label: "Prima Nota",
    description: "Movimenti e saldi banca",
    href: "/acquisti/prima-nota",
    icon: Archive,
    color: "text-accent-primary",
  },
  {
    id: "magazzino",
    label: "Magazzino",
    description: "Giacenze e ricezioni",
    href: "/acquisti/magazzini",
    icon: Package,
    color: "text-accent-amber",
  },
  {
    id: "ordini",
    label: "Ordini fornitore",
    description: "Acquisti e consegne",
    href: "/acquisti/ordini",
    icon: Send,
    color: "text-accent-purple",
  },
  {
    id: "scadenze",
    label: "Scadenzario",
    description: "Prossime scadenze",
    href: "/acquisti/scadenzario",
    icon: CalendarDays,
    color: "text-accent-red",
  },
];
function initials(email?: string) {
  return (email || "?").slice(0, 2).toUpperCase();
}
function dueLabel(date: string | null) {
  return date
    ? new Date(date).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
      })
    : "Senza scadenza";
}

export default function TaskManagerPage() {
  const [scope, setScope] = useState<Scope>("assigned");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(true);
  const [showModules, setShowModules] = useState(false);
  const [pinned, setPinned] = useState<string[]>(
    MODULES.slice(0, 3).map((m) => m.id),
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [relatedType, setRelatedType] = useState("");
  const [relatedLabel, setRelatedLabel] = useState("");
  const [relatedUrl, setRelatedUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(
    async (s: Scope) => {
      try {
        const result = await api.tasks.list(s);
        setTasks(result.tasks);
        if (selected)
          setSelected(result.tasks.find((t) => t.id === selected.id) || null);
      } catch {
        setTasks([]);
      }
    },
    [selected],
  );
  useEffect(() => {
    load(scope);
  }, [scope, load]);
  useEffect(() => {
    api.tasks
      .assignableUsers()
      .then(({ users: u }) => setUsers(u))
      .catch(() => {});
    try {
      const raw = localStorage.getItem("wbdash-task-modules");
      if (raw) setPinned(JSON.parse(raw));
    } catch {}
  }, []);
  const toggleModule = (id: string) =>
    setPinned((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      localStorage.setItem("wbdash-task-modules", JSON.stringify(next));
      return next;
    });
  const filtered = useMemo(
    () =>
      tasks.filter((t) =>
        `${t.title} ${t.description || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [tasks, query],
  );
  const counts = STATUS.reduce(
    (a, s) => ({ ...a, [s]: filtered.filter((t) => t.status === s).length }),
    {} as Record<TaskStatus, number>,
  );
  const createTask = async () => {
    if (!title.trim() || !assigneeId) return;
    setCreating(true);
    setError(null);
    try {
      await api.tasks.create({
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId,
        dueDate: dueDate || undefined,
        relatedType: relatedType || undefined,
        relatedLabel: relatedLabel || undefined,
        relatedUrl: relatedUrl || undefined,
      });
      setTitle("");
      setDescription("");
      setAssigneeId("");
      setDueDate("");
      setRelatedType(""); setRelatedLabel(""); setRelatedUrl("");
      setShowCreate(false);
      load(scope);
    } catch {
      setError("Impossibile creare il task in questo momento.");
    } finally {
      setCreating(false);
    }
  };
  const advance = async (task: Task, status: TaskStatus) => {
    try {
      const updated = await api.tasks.updateStatus(task.id, status);
      emitTaskStatusChanged();
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      setSelected(updated);
    } catch {
      setError("Impossibile aggiornare il task.");
    }
  };
  const assignee = (id: string) => users.find((u) => u.id === id)?.email;
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader
        accentColor="primary"
        notificationCount={counts.TODO + counts.IN_PROGRESS}
      />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1680px] mx-auto px-4 md:px-8 py-5 md:py-7">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <div className="flex items-center gap-2 text-accent-primary text-[10px] font-bold uppercase tracking-[.14em]">
                  <Sparkles size={13} /> Workspace operativo
                </div>
                <h1 className="text-2xl font-bold text-white mt-1">
                  La mia scrivania
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  Organizza il lavoro, richiama i moduli e porta a termine ciò
                  che conta.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowModules(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bg-border bg-bg-card text-xs font-medium text-zinc-400 hover:text-white"
                >
                  <SlidersHorizontal size={14} /> Moduli della scrivania
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent-primary text-white text-xs font-semibold hover:opacity-90"
                >
                  <Plus size={15} /> Nuovo task
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                {
                  label: "Da fare",
                  value: counts.TODO,
                  icon: ListTodo,
                  color: "text-accent-amber",
                },
                {
                  label: "In corso",
                  value: counts.IN_PROGRESS,
                  icon: Clock3,
                  color: "text-accent-blue",
                },
                {
                  label: "Completati",
                  value: counts.DONE,
                  icon: CheckCircle2,
                  color: "text-accent-primary",
                },
                {
                  label: "Collaboratori",
                  value: users.length,
                  icon: Users,
                  color: "text-accent-purple",
                },
              ].map((k) => (
                <div
                  key={k.label}
                  className="bg-bg-card border border-bg-border rounded-xl p-3.5 flex items-center gap-3"
                >
                  <span
                    className={`h-9 w-9 rounded-lg bg-bg-hover flex items-center justify-center ${k.color}`}
                  >
                    <k.icon size={17} />
                  </span>
                  <div>
                    <div className="text-xl font-bold text-white tabular-nums">
                      {k.value}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                      {k.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[210px_minmax(0,1fr)_330px] gap-4 items-start">
              <aside className="bg-bg-card border border-bg-border rounded-xl p-2.5 space-y-1">
                <div className="px-2 py-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                  Workspace
                </div>
                {[
                  ["assigned", "La mia inbox", Bell],
                  ["created", "Creati da me", Send],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value as string}
                    onClick={() => setScope(value as Scope)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium ${scope === value ? "bg-accent-primary/10 text-accent-primary" : "text-zinc-500 hover:bg-bg-hover hover:text-zinc-300"}`}
                  >
                    <Icon size={14} />
                    {label as string}
                    {scope === value && (
                      <span className="ml-auto text-[10px]">
                        {tasks.length}
                      </span>
                    )}
                  </button>
                ))}
                <div className="h-px bg-bg-border my-2" />
                <div className="px-2 py-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                  Viste rapide
                </div>
                {["Oggi", "In ritardo", "Alta priorità"].map((label) => (
                  <button
                    key={label}
                    className="w-full text-left px-2.5 py-2 text-xs text-zinc-500 hover:bg-bg-hover rounded-lg"
                  >
                    {label}
                  </button>
                ))}
                <div className="h-px bg-bg-border my-2" />
                <Link
                  href="/bacheca"
                  className="flex items-center gap-2 px-2.5 py-2 text-xs text-zinc-500 hover:text-accent-primary"
                >
                  <LayoutGrid size={14} /> Bacheca widget
                </Link>
              </aside>
              <section className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">
                      Attività
                    </h2>
                    <span className="text-[10px] text-zinc-500">
                      {filtered.length} task
                    </span>
                    {filtered.some((t) => t.status === "IN_PROGRESS") && (
                      <button
                        onClick={() => {
                          const task = filtered.find(
                            (t) => t.status === "IN_PROGRESS",
                          );
                          if (task) advance(task, "DONE");
                        }}
                        className="ml-2 text-[10px] text-accent-primary hover:underline"
                      >
                        Segna come fatto
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-2.5 text-zinc-500"
                      />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Cerca task..."
                        className="w-44 pl-8 pr-2 py-2 rounded-lg border border-bg-border bg-bg-card text-xs text-white"
                      />
                    </div>
                    <button className="p-2 rounded-lg border border-bg-border text-zinc-500 hover:text-white">
                      <Filter size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {STATUS.map((status) => (
                    <div
                      key={status}
                      className="rounded-xl bg-bg-hover/45 border border-bg-border/70 p-2.5 min-h-[260px]"
                    >
                      <div className="flex items-center justify-between px-1 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${status === "TODO" ? "bg-accent-amber" : status === "IN_PROGRESS" ? "bg-accent-blue" : "bg-accent-primary"}`}
                          />
                          <span className="text-[11px] font-semibold text-zinc-300">
                            {STATUS_LABEL[status]}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {counts[status]}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {filtered
                          .filter((t) => t.status === status)
                          .map((task) => (
                            <button
                              key={task.id}
                              onClick={() => setSelected(task)}
                              className={`w-full text-left bg-bg-card border rounded-lg p-3 hover:border-accent-primary/40 transition-colors ${selected?.id === task.id ? "border-accent-primary/60" : "border-bg-border"}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-semibold text-white leading-snug">
                                  {task.title}
                                </span>
                                <MoreHorizontal
                                  size={14}
                                  className="text-zinc-500 shrink-0"
                                />
                              </div>
                              {task.description && (
                                <p className="text-[11px] text-zinc-500 mt-1.5 line-clamp-2">
                                  {task.description}
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-3">
                                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                                  <CalendarDays size={11} />{" "}
                                  {dueLabel(task.dueDate)}
                                </span>
                                <span
                                  title={assignee(task.assigneeId)}
                                  className="h-6 w-6 rounded-full bg-accent-primary/15 text-accent-primary flex items-center justify-center text-[9px] font-bold"
                                >
                                  {initials(assignee(task.assigneeId))}
                                </span>
                              </div>
                            </button>
                          ))}
                        {filtered.filter((t) => t.status === status).length ===
                          0 && (
                          <div className="text-center py-10 text-[11px] text-zinc-600">
                            {status === "TODO" ? "Nessun task" : "—"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <aside className="bg-bg-card border border-bg-border rounded-xl p-4 min-h-[360px]">
                {selected ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold ${STATUS_COLOR[selected.status]}`}
                      >
                        {STATUS_LABEL[selected.status]}
                      </span>
                      <button
                        onClick={() => setSelected(null)}
                        className="text-zinc-500 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <h2 className="text-lg font-semibold text-white mt-4">
                      {selected.title}
                    </h2>
                    {selected.description && (
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                        {selected.description}
                      </p>
                    )}
                    {selected.relatedUrl && (
                      <a href={selected.relatedUrl} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent-blue/20 bg-accent-blue/10 px-3 py-2 text-xs font-medium text-accent-blue hover:bg-accent-blue/15">
                        Apri {selected.relatedLabel || "collegamento"} ↗
                      </a>
                    )}
                    <div className="space-y-3 mt-5 border-t border-bg-border pt-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500 flex items-center gap-2">
                          <UserRound size={13} /> Assegnato a
                        </span>
                        <span className="text-zinc-300">
                          {assignee(selected.assigneeId) || "Utente"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500 flex items-center gap-2">
                          <CalendarDays size={13} /> Scadenza
                        </span>
                        <span className="text-zinc-300">
                          {dueLabel(selected.dueDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500 flex items-center gap-2">
                          <MessageSquare size={13} /> Attività
                        </span>
                        <span className="text-zinc-500">Nessun commento</span>
                      </div>
                    </div>
                    {selected.status !== "DONE" && (
                      <button
                        onClick={() =>
                          advance(
                            selected,
                            selected.status === "TODO" ? "IN_PROGRESS" : "DONE",
                          )
                        }
                        className="w-full mt-6 py-2 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-xs font-semibold text-accent-primary"
                      >
                        {selected.status === "TODO"
                          ? "Inizia attività"
                          : "Segna come fatto"}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <CheckCircle2 size={30} className="text-zinc-600 mb-3" />
                    <p className="text-sm font-medium text-zinc-400">
                      Seleziona un task
                    </p>
                    <p className="text-xs text-zinc-600 mt-1 max-w-[210px]">
                      Apri una scheda per vedere dettagli, assegnazione e
                      prossime azioni.
                    </p>
                  </div>
                )}
              </aside>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    I tuoi moduli
                  </h2>
                  <p className="text-[11px] text-zinc-500">
                    Accesso rapido alle aree che usi di più
                  </p>
                </div>
                <button
                  onClick={() => setShowModules(true)}
                  className="text-[11px] text-accent-primary hover:underline"
                >
                  Personalizza
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {MODULES.filter((m) => pinned.includes(m.id)).map((m) => (
                  <Link
                    key={m.id}
                    href={m.href}
                    className="bg-bg-card border border-bg-border rounded-xl p-3 hover:border-accent-primary/40 transition-colors"
                  >
                    <m.icon size={16} className={m.color} />
                    <div className="text-xs font-semibold text-white mt-3">
                      {m.label}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-1">
                      {m.description}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-bg-card border border-bg-border shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Nuovo task</h2>
              <button onClick={() => setShowCreate(false)}>
                <X size={16} className="text-zinc-500" />
              </button>
            </div>
            {error && <p className="text-xs text-accent-red mb-2">{error}</p>}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titolo del task"
              className="w-full px-3 py-2 rounded-lg border border-bg-border bg-bg-hover text-sm text-white mb-2"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrizione, contesto o istruzioni"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-bg-border bg-bg-hover text-xs text-white mb-3"
            />
              <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-zinc-500">
                Assegna a
                <select
                  aria-label="Assegna a"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="mt-1 w-full px-2 py-2 rounded-lg border border-bg-border bg-bg-hover text-xs text-white"
                >
                  <option value="">Seleziona utente</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-zinc-500">
                Scadenza
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full px-2 py-2 rounded-lg border border-bg-border bg-bg-hover text-xs text-white"
                />
              </label>
              </div>
              <div className="mt-3 rounded-lg border border-bg-border bg-bg-hover/50 p-3">
                <div className="text-[11px] font-semibold text-zinc-400 mb-2">Collega a un modulo o record</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select aria-label="Tipo collegamento" value={relatedType} onChange={e => setRelatedType(e.target.value)} className="px-2 py-2 rounded-lg border border-bg-border bg-bg-card text-xs text-white"><option value="">Tipo</option><option value="amazon">Amazon</option><option value="order">Ordine</option><option value="product">Prodotto / ASIN</option><option value="bank">Prima Nota</option><option value="warehouse">Magazzino / DDT</option><option value="due">Scadenza</option></select>
                  <input value={relatedLabel} onChange={e => setRelatedLabel(e.target.value)} placeholder="Nome record" className="px-2 py-2 rounded-lg border border-bg-border bg-bg-card text-xs text-white" />
                  <input value={relatedUrl} onChange={e => setRelatedUrl(e.target.value)} placeholder="URL del record" type="url" className="px-2 py-2 rounded-lg border border-bg-border bg-bg-card text-xs text-white" />
                </div>
              </div>
              <button
              onClick={createTask}
              disabled={creating || !title.trim() || !assigneeId}
              className="mt-4 w-full py-2.5 rounded-lg bg-accent-primary text-white text-xs font-semibold disabled:opacity-50"
            >
              {creating ? "Creazione..." : "Crea task"}
            </button>
          </div>
        </div>
      )}
      {showModules && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-bg-card border border-bg-border shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Moduli della scrivania
                </h2>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Scegli quali collegamenti tenere sempre a portata di mano.
                </p>
              </div>
              <button onClick={() => setShowModules(false)}>
                <X size={16} className="text-zinc-500" />
              </button>
            </div>
            <div className="space-y-2">
              {MODULES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggleModule(m.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-bg-border hover:bg-bg-hover text-left"
                >
                  <m.icon size={16} className={m.color} />
                  <span className="flex-1">
                    <span className="block text-xs font-semibold text-white">
                      {m.label}
                    </span>
                    <span className="block text-[10px] text-zinc-500">
                      {m.description}
                    </span>
                  </span>
                  {pinned.includes(m.id) ? (
                    <Check size={15} className="text-accent-primary" />
                  ) : (
                    <span className="h-4 w-4 rounded border border-bg-border" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowModules(false)}
              className="mt-4 w-full py-2 rounded-lg bg-accent-primary text-white text-xs font-semibold"
            >
              Salva configurazione
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
