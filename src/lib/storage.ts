// localStorage can be unavailable (private mode, blocked storage, previews),
// so every access is guarded and the app keeps working without it.

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full — ignore */
  }
}

/** Moves a value saved under an old key (for example from before the app was renamed) to its new key. */
export function renameKey(from: string, to: string): void {
  try {
    const storage = window.localStorage;
    const old = storage.getItem(from);
    if (old === null) return;
    if (storage.getItem(to) === null) storage.setItem(to, old);
    storage.removeItem(from);
  } catch {
    /* storage unavailable */
  }
}
