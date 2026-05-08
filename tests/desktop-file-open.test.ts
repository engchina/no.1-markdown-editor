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
