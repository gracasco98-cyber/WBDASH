import { describe, it, expect, vi } from "vitest";
import { emitTaskStatusChanged, onTaskStatusChanged } from "./taskEvents";

describe("taskEvents", () => {
  it("calls subscribers when a status change is emitted", () => {
    const callback = vi.fn();
    onTaskStatusChanged(callback);

    emitTaskStatusChanged();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("stops calling a subscriber once it unsubscribes", () => {
    const callback = vi.fn();
    const unsubscribe = onTaskStatusChanged(callback);
    unsubscribe();

    emitTaskStatusChanged();

    expect(callback).not.toHaveBeenCalled();
  });
});
