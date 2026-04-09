const RECOVERY_STORAGE_KEY = 'vite-dynamic-import-recovery'
const RECOVERY_COOLDOWN_MS = 10_000
const DYNAMIC_IMPORT_ERROR_PATTERN =
  /(?:Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module)/iu
const RECOVERY_TRIGGERED_MARKER = Symbol('dynamic-import-recovery-triggered')

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type RecoverableErrorLike = Error & { [RECOVERY_TRIGGERED_MARKER]?: true }

interface RecoveryAttempt {
  href: string
  at: number
}

let inMemoryRecoveryAttempt: RecoveryAttempt | null = null

export function getDynamicImportFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

export function isRecoverableDynamicImportFailure(error: unknown): boolean {
  return DYNAMIC_IMPORT_ERROR_PATTERN.test(getDynamicImportFailureMessage(error))
}

function markDynamicImportRecoveryTriggered(error: unknown): void {
  if (!error || typeof error !== 'object') return

  try {
    ;(error as RecoverableErrorLike)[RECOVERY_TRIGGERED_MARKER] = true
  } catch {
    // Ignore non-extensible thrown values.
  }
}

export function wasDynamicImportRecoveryTriggered(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as RecoverableErrorLike)[RECOVERY_TRIGGERED_MARKER] === true
  )
}

function readRecoveryAttempt(storage: StorageLike | null): RecoveryAttempt | null {
  if (!storage) return inMemoryRecoveryAttempt

  const raw = storage.getItem(RECOVERY_STORAGE_KEY)
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as Partial<RecoveryAttempt>
    if (typeof value.href !== 'string' || typeof value.at !== 'number' || Number.isNaN(value.at)) {
      return null
    }

    return { href: value.href, at: value.at }
  } catch {
    return null
  }
}

function writeRecoveryAttempt(storage: StorageLike | null, attempt: RecoveryAttempt): void {
  inMemoryRecoveryAttempt = attempt
  if (!storage) return

  storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(attempt))
}

export function shouldRetryDynamicImportRecovery(
  storage: StorageLike | null,
  href: string,
  now = Date.now()
): boolean {
  const previous = readRecoveryAttempt(storage)
  if (!previous) return true
  return previous.href !== href || now - previous.at > RECOVERY_COOLDOWN_MS
}

function getSessionStorageSafely(): StorageLike | null {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function scheduleDynamicImportRecovery(error: unknown, preventDefault?: () => void): boolean {
  if (typeof window === 'undefined' || !isRecoverableDynamicImportFailure(error)) return false

  const storage = getSessionStorageSafely()
  const href = window.location.href
  const now = Date.now()

  if (!shouldRetryDynamicImportRecovery(storage, href, now)) {
    return false
  }

  preventDefault?.()
  writeRecoveryAttempt(storage, { href, at: now })
  markDynamicImportRecoveryTriggered(error)
  window.location.reload()
  return true
}

export function attemptDynamicImportRecovery(error: unknown): boolean {
  return scheduleDynamicImportRecovery(error)
}

export function installVitePreloadRecovery(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    const payload = (event as Event & { payload?: unknown }).payload
    scheduleDynamicImportRecovery(payload, () => event.preventDefault())
  })
}
