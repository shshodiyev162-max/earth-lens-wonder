// A small persistent cache for NASA responses (decoded grids, climate series, place names).
// It lives in the browser's IndexedDB, so a repeated scan or analysis loads instantly and
// NASA's free services aren't asked twice for the same month. Entries expire; when IndexedDB
// is unavailable (private windows, tests) an in-memory store is used instead.

export interface CacheEntry {
  value: unknown;
  /** Epoch milliseconds after which the entry is stale. */
  expires: number;
}

export interface CacheBackend {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
}

const DAY = 86_400_000;

/** How long each kind of response is kept. Past months of NASA products don't change. */
export const TTL = {
  grid: 30 * DAY,
  /** The two most recent months can still be reprocessed by NASA. */
  recentGrid: 2 * DAY,
  series: 7 * DAY,
  place: 30 * DAY,
} as const;

export function memoryBackend(): CacheBackend {
  const map = new Map<string, CacheEntry>();
  return {
    get: async (key) => map.get(key),
    set: async (key, entry) => {
      map.set(key, entry);
    },
    delete: async (key) => {
      map.delete(key);
    },
  };
}

const DB_NAME = "terravision-cache";
const STORE = "entries";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function indexedDbBackend(): CacheBackend | null {
  if (typeof indexedDB === "undefined") return null;
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!opening) {
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("Cache database is blocked"));
      });
      // Remove expired entries once per visit, in the background.
      opening
        .then((db) => {
          const tx = db.transaction(STORE, "readwrite");
          const cursorRequest = tx.objectStore(STORE).openCursor();
          const now = Date.now();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            if ((cursor.value as CacheEntry).expires < now) cursor.delete();
            cursor.continue();
          };
        })
        .catch(() => undefined);
    }
    return opening;
  };
  return {
    async get(key) {
      const db = await open();
      return request(db.transaction(STORE, "readonly").objectStore(STORE).get(key)) as Promise<CacheEntry | undefined>;
    },
    async set(key, entry) {
      const db = await open();
      await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(entry, key));
    },
    async delete(key) {
      const db = await open();
      await request(db.transaction(STORE, "readwrite").objectStore(STORE).delete(key));
    },
  };
}

let backend: CacheBackend | null = null;
let fallback: CacheBackend | null = null;

function current(): CacheBackend {
  if (!backend) backend = indexedDbBackend() ?? memoryBackend();
  return backend;
}

/** Switches to memory after the first IndexedDB failure (quota, private mode). */
function memoryFallback(): CacheBackend {
  if (!fallback) fallback = memoryBackend();
  backend = fallback;
  return fallback;
}

/** For tests: use a specific backend. */
export function setCacheBackend(next: CacheBackend | null): void {
  backend = next;
  fallback = null;
}

export async function readCache<T>(key: string, now = Date.now()): Promise<T | undefined> {
  try {
    const entry = await current().get(key);
    if (!entry) return undefined;
    if (entry.expires < now) {
      void current().delete(key).catch(() => undefined);
      return undefined;
    }
    return entry.value as T;
  } catch {
    memoryFallback();
    return undefined;
  }
}

export async function writeCache(key: string, value: unknown, ttlMs: number, now = Date.now()): Promise<void> {
  try {
    await current().set(key, { value, expires: now + ttlMs });
  } catch {
    await memoryFallback().set(key, { value, expires: now + ttlMs });
  }
}

/** Returns the cached value, or runs `load`, stores its result and returns it. Failures are never cached. */
export async function cachedValue<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = await readCache<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  void writeCache(key, value, ttlMs);
  return value;
}
