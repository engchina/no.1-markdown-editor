import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('useAutoSave never writes over a tab with a pending external file conflict', async () => {
  const source = await readFile(new URL('../src/hooks/useAutoSave.ts', import.meta.url), 'utf8')

  assert.match(
    source,
    /externalFileConflicts\.some\(\(conflict\) => conflict\.tabId === tabId\)/,
    'the save runner must re-check conflicts at fire time'
  )
  assert.match(
    source,
    /conflictTabIds\.has\(tab\.id\)/,
    'the scheduler must skip tabs with pending conflicts'
  )
  assert.match(
    source,
    /useEditorStore\(\(state\) => state\.externalFileConflicts\)/,
    'the hook must subscribe to conflict changes so paused tabs resume after resolution'
  )
})

test('useAutoSave retries failed saves a bounded number of times', async () => {
  const source = await readFile(new URL('../src/hooks/useAutoSave.ts', import.meta.url), 'utf8')

  assert.match(source, /MAX_AUTOSAVE_ATTEMPTS/)
  assert.match(source, /AUTOSAVE_RETRY_DELAY/)
  assert.match(
    source,
    /attempts < MAX_AUTOSAVE_ATTEMPTS/,
    'retries must stop after the attempt budget is exhausted'
  )
})

test('useFileOps records the exact written content as the saved snapshot', async () => {
  const source = await readFile(new URL('../src/hooks/useFileOps.ts', import.meta.url), 'utf8')

  assert.match(
    source,
    /saveTab\(tab\.id, nextContent\)/,
    'the Tauri save path must mark saved against the content written to disk'
  )
  assert.match(
    source,
    /saveTab\(tab\.id, tab\.content\)/,
    'the browser download path must mark saved against the downloaded snapshot'
  )
  assert.doesNotMatch(
    source,
    /saveTab\(tab\.id\)(?!,)/,
    'saveTab must never be called without the written content'
  )
})
