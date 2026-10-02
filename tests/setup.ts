/**
 * Node 25 exposes its own `localStorage` / `sessionStorage` globals, which land
 * on both `globalThis` and the jsdom window and are not Web Storage objects.
 * Any module that reads them at import time (pinia's devtools hook, our config
 * cache) throws before a single test runs. Replace them with in-memory Storage.
 */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(String(key)) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(String(key)),
    setItem: (key: string, value: string) => void entries.set(String(key), String(value)),
  } as Storage;
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  const targets = [globalThis, (globalThis as Record<string, unknown>).window].filter(
    Boolean,
  ) as Record<string, Storage | undefined>[];
  const usable = targets.some((target) => typeof target[key]?.getItem === 'function');
  if (usable) continue;

  const storage = createMemoryStorage();
  for (const target of targets) {
    Object.defineProperty(target, key, { value: storage, configurable: true, writable: true });
  }
}
