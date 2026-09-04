const EVENT_NAME = "wbdash:task-status-changed";

export function emitTaskStatusChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onTaskStatusChanged(callback: () => void): () => void {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
