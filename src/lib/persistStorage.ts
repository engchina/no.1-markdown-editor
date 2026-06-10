/** Synchronous narrowing of zustand's StateStorage (localStorage-shaped). */
export interface SyncStateStorage {
  getItem(name: string): string | null
  setItem(name: string, value: string): void
  removeItem(name: string): void
}

export interface DebouncedStateStorage extends SyncStateStorage {
  /** Write any pending values through to the underlying storage immediately. */
  flush(): void
}

interface PendingWrite {
  value: string
  /**
   * Underlying value observed when this write was first scheduled. If the
   * underlying storage no longer matches at flush time, an external writer
   * (another tab, a test seeding state before reload) owns the key and the
   * stale pending value is dropped instead of clobbering it.
   */
  base: string | null
}

/**
 * Wraps a synchronous StateStorage so rapid setItem calls (e.g. zustand
 * persist firing on every keystroke) collapse into one underlying write per
 * debounce window. getItem reads through pending values so callers never
 * observe stale data.
 */
export function createDebouncedStateStorage(
  storage: SyncStateStorage,
  delayMs: number
): DebouncedStateStorage {
  const pendingWrites = new Map<string, PendingWrite>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    for (const [name, pending] of pendingWrites) {
      if (storage.getItem(name) === pending.base) {
        storage.setItem(name, pending.value)
      }
    }
    pendingWrites.clear()
  }

  const schedule = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, delayMs)
  }

  return {
    getItem: (name) => {
      const pending = pendingWrites.get(name)
      if (pending !== undefined) return pending.value
      return storage.getItem(name)
    },
    setItem: (name, value) => {
      const existing = pendingWrites.get(name)
      const base = existing ? existing.base : storage.getItem(name)
      pendingWrites.set(name, { value, base })
      schedule()
    },
    removeItem: (name) => {
      pendingWrites.delete(name)
      storage.removeItem(name)
    },
    flush,
  }
}

export function createSafeLocalStorage(): SyncStateStorage {
  return {
    getItem: (name) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(name)),
    setItem: (name, value) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(name, value)
    },
    removeItem: (name) => {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(name)
    },
  }
}
