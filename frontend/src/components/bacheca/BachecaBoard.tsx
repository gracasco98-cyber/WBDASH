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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/10 border border-amber-900/20 text-amber-900 text-xs font-medium hover:bg-amber-900/20 transition-colors"
          >
            <Plus size={13} /> Aggiungi widget
          </button>
          {pickerOpen && (
            <div className="absolute right-0 mt-1 z-20 bg-white border border-amber-900/20 rounded-lg shadow-lg py-1 min-w-[160px]">
              {WIDGET_REGISTRY.map(def => (
                <button
                  key={def.type}
                  onClick={() => addWidget(def.type)}
                  className="w-full text-left px-3 py-1.5 text-xs text-amber-950 hover:bg-amber-50"
                >
                  {def.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="text-center py-16 text-amber-950/50 text-sm">
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
              <div key={widget.i} className="bg-[#fdf6e3] border border-amber-900/15 rounded-sm shadow-md p-3 pt-6 relative rotate-[-0.4deg] overflow-hidden">
                <div className="widget-drag-handle absolute top-0 left-0 right-0 h-5 cursor-move" />
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 shadow-sm absolute -top-1 left-1/2 -translate-x-1/2" />
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-amber-950/50 uppercase tracking-wide">{def?.label}</span>
                  <button
                    onClick={() => removeWidget(widget.i)}
                    aria-label={`Rimuovi ${def?.label}`}
                    className="text-amber-950/30 hover:text-amber-950/70"
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
