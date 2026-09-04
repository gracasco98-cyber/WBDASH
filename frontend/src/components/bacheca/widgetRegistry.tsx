import type { ReactNode } from "react";
import TasksWidget from "./widgets/TasksWidget";
import NoteWidget from "./widgets/NoteWidget";
import RevenueTodayWidget from "./widgets/RevenueTodayWidget";
import ScadenzeWidget from "./widgets/ScadenzeWidget";
import OrdersInProgressWidget from "./widgets/OrdersInProgressWidget";
import type { BoardWidget } from "@/lib/api";

export interface WidgetDef {
  type: string;
  label: string;
  defaultSize: { w: number; h: number };
  render: (widget: BoardWidget, onConfigChange: (config: Record<string, unknown>) => void) => ReactNode;
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  { type: "tasks", label: "I miei task", defaultSize: { w: 3, h: 3 }, render: () => <TasksWidget /> },
  {
    type: "note", label: "Nota veloce", defaultSize: { w: 3, h: 3 },
    render: (w, onConfigChange) => <NoteWidget config={w.config} onConfigChange={onConfigChange} />,
  },
  { type: "revenue-today", label: "Ricavi di oggi", defaultSize: { w: 2, h: 2 }, render: () => <RevenueTodayWidget /> },
  { type: "scadenze", label: "Prossime scadenze", defaultSize: { w: 3, h: 3 }, render: () => <ScadenzeWidget /> },
  { type: "orders-in-progress", label: "Ordini in corso", defaultSize: { w: 2, h: 2 }, render: () => <OrdersInProgressWidget /> },
];

export function widgetDef(type: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find(w => w.type === type);
}
