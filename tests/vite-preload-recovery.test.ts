import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attemptDynamicImportRecovery,
  getDynamicImportFailureMessage,
  isRecoverableDynamicImportFailure,
  shouldRetryDynamicImportRecovery,
  wasDynamicImportRecoveryTriggered,
} from '../src/lib/vitePreloadRecovery.ts'

class MemoryStorage {
  private readonly store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

test('getDynamicImportFailureMessage normalizes supported error payloads', () => {
  assert.equal(
    getDynamicImportFailureMessage(new Error('Failed to fetch dynamically imported module: /node_modules/.vite/deps/mermaid.js?v=stale')),
    'Failed to fetch dynamically imported module: /node_modules/.vite/deps/mermaid.js?v=stale'
  )
  assert.equal(
    getDynamicImportFailureMessage('Importing a module script failed.'),
    'Importing a module script failed.'
  )
  assert.equal(getDynamicImportFailureMessage(null), '')
})

test('isRecoverableDynamicImportFailure matches common browser messages for stale lazy imports', () => {
  assert.equal(
    isRecoverableDynamicImportFailure(
      new Error('Failed to fetch dynamically imported module: http://127.0.0.1:1420/node_modules/.vite/deps/mermaid.js?v=4cb0ec29')
    ),
    true
  )
  assert.equal(isRecoverableDynamicImportFailure('Importing a module script failed.'), true)
  assert.equal(isRecoverableDynamicImportFailure('error loading dynamically imported module'), true)
  assert.equal(isRecoverableDynamicImportFailure(new Error('Diagram could not be rendered: Parse failure near line 3')), false)
})

test('shouldRetryDynamicImportRecovery rate limits repeated reload attempts for the same page', () => {
  const storage = new MemoryStorage()
  const href = 'http://127.0.0.1:1420/'

  assert.equal(shouldRetryDynamicImportRecovery(storage, href, 10_000), true)
  storage.setItem('vite-dynamic-import-recovery', JSON.stringify({ href, at: 10_000 }))
  assert.equal(shouldRetryDynamicImportRecovery(storage, href, 10_001), false)
  assert.equal(shouldRetryDynamicImportRecovery(storage, href, 20_001), true)
  assert.equal(shouldRetryDynamicImportRecovery(storage, 'http://127.0.0.1:1420/preview', 10_001), true)
})

test('attemptDynamicImportRecovery marks the handled error when reload recovery is triggered', () => {
  const originalWindow = globalThis.window
  const storage = new MemoryStorage()
  let reloadCount = 0
  const error = new Error(
    'Failed to fetch dynamically imported module: http://127.0.0.1:1420/node_modules/.vite/deps/mermaid.js?v=stale'
  )

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: 'http://127.0.0.1:1420/',
        reload() {
          reloadCount += 1
        },
      },
      sessionStorage: storage,
    },
  })

  try {
    assert.equal(attemptDynamicImportRecovery(error), true)
    assert.equal(wasDynamicImportRecoveryTriggered(error), true)
    assert.equal(reloadCount, 1)
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})
