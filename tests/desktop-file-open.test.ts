import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('openDesktopDocumentPath supports a silent option to suppress per-file error toasts', async () => {
  const source = await readFile(new URL('../src/lib/desktopFileOpen.ts', import.meta.url), 'utf8')

  assert.match(source, /options:\s*\{\s*silent\?:\s*boolean\s*\}/)
  assert.match(source, /if\s*\(!options\.silent\)\s*\{[\s\S]*pushErrorNotice\('notices\.openFileErrorTitle'/)
})

test('openDesktopDocumentPaths aggregates per-file failures into a single toast in batch mode', async () => {
  const source = await readFile(new URL('../src/lib/desktopFileOpen.ts', import.meta.url), 'utf8')

  assert.match(source, /const isBatch = targets\.length > 1/)
  assert.match(source, /openDesktopDocumentPath\(path, \{ silent: isBatch \}\)/)
  assert.match(
    source,
    /if \(isBatch && failures > 0\)[\s\S]*pushErrorNotice\(\s*'notices\.openMultipleFilesErrorTitle',\s*'notices\.openMultipleFilesErrorMessage'/
  )
})

test('desktop read_file command runs file IO off the Tauri event loop', async () => {
  const source = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')

  assert.match(source, /async fn read_file\(path: String\) -> Result<String, String>/)
  assert.match(source, /tokio::task::spawn_blocking\(move \|\| std::fs::read_to_string\(path\)\)/)
  assert.doesNotMatch(source, /fn read_file\(path: String\) -> Result<String, String> \{\s*std::fs::read_to_string\(&path\)/)
})

test('single-instance file open requests are queued before notifying the frontend', async () => {
  const source = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')

  const singleInstanceBlock = source.slice(
    source.indexOf('fn register_single_instance_plugin'),
    source.indexOf('#[cfg_attr(mobile, tauri::mobile_entry_point)]')
  )

  assert.match(singleInstanceBlock, /app\.try_state::<PendingOpenPaths>\(\)/)
  assert.match(singleInstanceBlock, /append_pending_open_paths\(&pending_paths, &launch_paths\)/)
  assert.match(singleInstanceBlock, /window\.emit\(SINGLE_INSTANCE_OPEN_FILES_EVENT, launch_paths\)/)
  assert.ok(
    singleInstanceBlock.indexOf('append_pending_open_paths') < singleInstanceBlock.indexOf('window.emit'),
    'launch paths should be queued before the frontend event is emitted'
  )
})

test('App drains queued launch paths when a single-instance event arrives', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(source, /const openQueuedDesktopDocumentPaths = async \(eventPaths: readonly string\[] = \[\]\) =>/)
  assert.match(source, /const queuedPaths = await invoke<string\[]>\('take_pending_open_paths'\)/)
  assert.match(source, /await openDesktopDocumentPaths\(\[\s*\.\.\.eventPaths,\s*\.\.\.pendingPaths,\s*\]\)/)
  assert.match(
    source,
    /currentWindow\.listen<string\[]>\(SINGLE_INSTANCE_OPEN_FILES_EVENT,[\s\S]*void openQueuedDesktopDocumentPaths\(paths\)/
  )
  assert.match(source, /await openQueuedDesktopDocumentPaths\(\)/)
})
