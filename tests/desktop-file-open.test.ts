import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('openDesktopDocumentPath supports a silent option to suppress per-file error toasts', async () => {
  const source = await readFile(new URL('../src/lib/desktopFileOpen.ts', import.meta.url), 'utf8')

  assert.match(source, /options:\s*\{\s*silent\?:\s*boolean\s*\}/)
  assert.match(source, /if\s*\(!options\.silent\)\s*\{[\s\S]*pushErrorNotice\('notices\.openFileErrorTitle'/)
})

test('openDesktopDocumentPath hides native browser webviews before activating markdown tabs', async () => {
  const source = await readFile(new URL('../src/lib/desktopFileOpen.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{ hideAllBrowserWebviews, hideInactiveBrowserWebviews \} from '\.\/browser\/webviewVisibility'/)
  assert.ok(
    source.indexOf('await hideAllBrowserWebviews()') < source.indexOf("invoke<string>('read_file'"),
    'browser child webviews should be hidden before the file read/open activates a markdown tab'
  )
  assert.match(source, /const openedTabId = useEditorStore\.getState\(\)\.openDocument/)
  assert.match(source, /useEditorStore\.getState\(\)\.setActiveTab\(openedTabId\)/)
  assert.match(source, /await hideInactiveBrowserWebviews\(openedTabId\)/)
  assert.ok(
    source.indexOf('const openedTabId = useEditorStore.getState().openDocument') <
      source.indexOf('await hideInactiveBrowserWebviews(openedTabId)'),
    'browser webviews should be hidden again after the markdown tab becomes active'
  )
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

test('single-instance file open reveals the editor surface before notifying the frontend', async () => {
  const source = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')

  const singleInstanceBlock = source.slice(
    source.indexOf('fn register_single_instance_plugin'),
    source.indexOf('#[cfg_attr(mobile, tauri::mobile_entry_point)]')
  )

  // The native reveal must run only once a launch document is present, and
  // before the frontend is asked to open it, so a frontmost browser child
  // webview can never keep the document from appearing.
  assert.match(singleInstanceBlock, /reveal_main_editor_surface\(app\)/)
  assert.ok(
    singleInstanceBlock.indexOf('if launch_paths.is_empty()') <
      singleInstanceBlock.indexOf('reveal_main_editor_surface(app)'),
    'the editor surface should only be revealed when a launch document is present'
  )
  assert.ok(
    singleInstanceBlock.indexOf('reveal_main_editor_surface(app)') <
      singleInstanceBlock.indexOf('window.emit'),
    'the editor surface should be revealed before the frontend open event is emitted'
  )

  // The reveal hides browser child webviews (which paint above the editor) and
  // refocuses the main editor webview.
  const revealBlock = source.slice(
    source.indexOf('fn reveal_main_editor_surface'),
    source.indexOf('fn register_single_instance_plugin')
  )
  assert.match(revealBlock, /is_browser_webview_label\(&label\)/)
  assert.match(revealBlock, /webview\.hide\(\)/)
  assert.match(revealBlock, /app\.get_webview\("main"\)[\s\S]*set_focus\(\)/)
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

test('App re-drains the native pending queue when the window regains focus', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(
    source,
    /currentWindow\.onFocusChanged\(\(\{ payload: focused \}\) => \{[\s\S]*if \(focused\) void openQueuedDesktopDocumentPaths\(\)/
  )
  assert.match(source, /if \(unlistenFocus\) unlistenFocus\(\)/)
})

test('App hides inactive native browser webviews when the active tab changes', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(source, /import \{ hideInactiveBrowserWebviews \} from '\.\/lib\/browser\/webviewVisibility'/)
  assert.match(source, /const browserWebviewVisibilityKey = useEditorStore/)
  assert.match(source, /void hideInactiveBrowserWebviews\(activeTab\?\.id \?\? null\)/)
  assert.match(source, /\}, \[activeTab\?\.id, browserWebviewVisibilityKey\]\)/)
})
