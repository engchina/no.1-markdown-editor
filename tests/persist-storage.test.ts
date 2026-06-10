import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createDebouncedStateStorage, type SyncStateStorage } from '../src/lib/persistStorage.ts'

function createRecordingStorage() {
  const values = new Map<string, string>()
  let writes = 0
  const storage: SyncStateStorage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      writes += 1
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
  return {
    storage,
    values,
    get writes() {
      return writes
    },
  }
}

test('debounced storage collapses rapid writes into one underlying setItem', async () => {
  const recording = createRecordingStorage()
  const debounced = createDebouncedStateStorage(recording.storage, 20)

  debounced.setItem('editor-settings', 'v1')
  debounced.setItem('editor-settings', 'v2')
  debounced.setItem('editor-settings', 'v3')

  assert.equal(recording.writes, 0, 'writes are deferred during the debounce window')

  await delay(60)

  assert.equal(recording.writes, 1)
  assert.equal(recording.values.get('editor-settings'), 'v3')
})

test('debounced storage reads through pending values so callers never see stale data', () => {
  const recording = createRecordingStorage()
  const debounced = createDebouncedStateStorage(recording.storage, 1000)

  recording.storage.setItem('editor-settings', 'persisted')
  debounced.setItem('editor-settings', 'pending')

  assert.equal(debounced.getItem('editor-settings'), 'pending')

  debounced.flush()
  assert.equal(recording.values.get('editor-settings'), 'pending')
})

test('flush writes pending values immediately and cancels the timer', async () => {
  const recording = createRecordingStorage()
  const debounced = createDebouncedStateStorage(recording.storage, 1000)

  debounced.setItem('editor-settings', 'flushed')
  debounced.flush()

  assert.equal(recording.values.get('editor-settings'), 'flushed')

  await delay(10)
  assert.equal(recording.writes, 1, 'no duplicate write after the flush')
})

test('flush drops a stale pending write when the underlying value changed externally', () => {
  const recording = createRecordingStorage()
  const debounced = createDebouncedStateStorage(recording.storage, 1000)

  recording.storage.setItem('editor-settings', 'app-state')
  debounced.setItem('editor-settings', 'newer-app-state')

  // e.g. a test (or another tab) seeds fresh state directly before a reload
  recording.storage.setItem('editor-settings', 'externally-seeded')

  debounced.flush()
  assert.equal(
    recording.values.get('editor-settings'),
    'externally-seeded',
    'an external write must win over the stale pending value'
  )
})

test('removeItem drops the pending value and removes the persisted one', () => {
  const recording = createRecordingStorage()
  const debounced = createDebouncedStateStorage(recording.storage, 1000)

  recording.storage.setItem('editor-settings', 'persisted')
  debounced.setItem('editor-settings', 'pending')
  debounced.removeItem('editor-settings')

  assert.equal(debounced.getItem('editor-settings'), null)
  debounced.flush()
  assert.equal(recording.values.has('editor-settings'), false)
})
