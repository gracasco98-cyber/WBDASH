// Plain (non-React) persistence for the global marketplace/channel filter,
// same pattern as amazonAccountStorage.ts — used by the React context below
// and, if needed later, by non-component code that can't use hooks.
const STORAGE_KEY = "wbdash:marketplaceFilter";
const CHANGE_EVENT = "wbdash:marketplace-filter-changed";
const DEFAULT_VALUE = "all";

export function getStoredMarketplace(): string {
  if (typeof window === "undefined") return DEFAULT_VALUE;
  return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_VALUE;
}

export function setStoredMarketplace(value: string): void {
  if (typeof window === "undefined") return;
  if (value === DEFAULT_VALUE) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
}

export function onMarketplaceChange(cb: (value: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleCustom = (e: Event) => cb((e as CustomEvent<string>).detail);
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(e.newValue ?? DEFAULT_VALUE);
  };
  window.addEventListener(CHANGE_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
