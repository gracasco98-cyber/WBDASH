"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import type { BoardWidget } from "@/lib/api";
import { WIDGET_REGISTRY, widgetDef } from "./widgetRegistry";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(GridLayout);

function nextY(widgets: BoardWidget[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
}

export default function BachecaBoard() {
  const [widgets, setWidgets] = useState<BoardWidget[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasMounted = useRef(false);

  useEffect(() => {
    api.board.getLayout().then(({ layout }) => { setWidgets(layout); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: BoardWidget[]) => {
    api.board.saveLayout(next).catch(() => {});
  }, []);

  const handleLayoutChange = (layout: Layout[]) => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    setWidgets(prev => {
      const next = prev.map(w => {
        const pos = layout.find(l => l.i === w.i);
        return pos ? { ...w, x: pos.x, y: pos.y, w: pos.w, h: pos.h } : w;
      });
      persist(next);
      return next;
    });
  };

  const addWidget = (type: string) => {
    const def = widgetDef(type);
    if (!def) return;
    const instance: BoardWidget = {
      i: `${type}-${Date.now()}`, type, x: 0, y: nextY(widgets), w: def.defaultSize.w, h: def.defaultSize.h,
    };
    const next = [...widgets, instance];
    setWidgets(next);
    persist(next);
    setPickerOpen(false);
  };

  const removeWidget = (i: string) => {
    const next = widgets.filter(w => w.i !== i);
    setWidgets(next);
    persist(next);
  };

  const updateWidgetConfig = (i: string, config: Record<string, unknown>) => {
    setWidgets(prev => {
      const next = prev.map(w => (w.i === i ? { ...w, config } : w));
      persist(next);
      return next;
    });
  };

  if (!loaded) return null;

  return (
    <div className="relative">
      <div className="flex justify-end mb-3">
        <div className="relative">
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-primary text-white text-xs font-semibold hover:opacity-90 transition-colors"
          >
            <Plus size={13} /> Aggiungi widget
          </button>
          {pickerOpen && (
            <div className="absolute right-0 mt-1 z-20 bg-bg-card border border-bg-border rounded-xl shadow-xl py-1 min-w-[210px]">
              {WIDGET_REGISTRY.map(def => (
                <button
                  key={def.type}
                  onClick={() => addWidget(def.type)}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-bg-hover"
                >
                  {def.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-bg-border bg-bg-card py-16 text-center text-zinc-500 text-sm">
          Bacheca vuota — aggiungi il tuo primo widget.
        </div>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          cols={12}
          rowHeight={70}
          layout={widgets.map(w => ({ i: w.i, x: w.x, y: w.y, w: w.w, h: w.h }))}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".widget-drag-handle"
        >
          {widgets.map(widget => {
            const def = widgetDef(widget.type);
            return (
              <div key={widget.i} className="bg-bg-card border border-bg-border rounded-xl shadow-sm p-3 pt-4 relative overflow-hidden">
                <div className="widget-drag-handle absolute top-0 left-0 right-0 h-3 cursor-move" />
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{def?.label}</span>
                  <button
                    onClick={() => removeWidget(widget.i)}
                    aria-label={`Rimuovi ${def?.label}`}
                    className="text-zinc-400 hover:text-accent-red"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="h-[calc(100%-24px)]">
                  {def?.render(widget, (config) => updateWidgetConfig(widget.i, config))}
                </div>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
