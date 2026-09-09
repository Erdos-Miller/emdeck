export function readStored<T>(key: string, fallback: T): T {
  // Keep the original relay: keys so the Emdeck rename preserves existing preferences.
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be unavailable; the workspace remains usable. */
  }
}
