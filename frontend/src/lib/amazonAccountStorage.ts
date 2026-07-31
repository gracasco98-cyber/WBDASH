// lib/amazonAccountStorage.ts — plain (non-React) persistence for the
// selected Amazon account, used both by React components (via
// context/AmazonAccountContext.tsx) and by the plain fetch wrapper in
// lib/api/client.ts, which isn't a component and can't use hooks.
const STORAGE_KEY = "wbdash:amazonAccountId";
const CHANGE_EVENT = "wbdash:amazon-account-changed";

export function getStoredAmazonAccountId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredAmazonAccountId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
}

/** Subscribe to changes made via setStoredAmazonAccountId (including from other tabs via the storage event). Returns an unsubscribe function. */
export function onAmazonAccountChange(cb: (id: string | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleCustom = (e: Event) => cb((e as CustomEvent<string | null>).detail);
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(e.newValue);
  };
  window.addEventListener(CHANGE_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
