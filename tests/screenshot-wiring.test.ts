import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('screenshot entry points share Alt+A and the capture request', () => {
  const app = read('src/App.tsx')
  const commands = read('src/hooks/useCommands.ts')
  const toolbar = read('src/components/Toolbar/Toolbar.tsx')
  const backend = read('src-tauri/src/screenshot.rs')
  const nativeBrowser = read('src-tauri/src/lib.rs')
  assert.match(app, /event\.altKey.*event\.code === 'KeyA'/)
  assert.match(app, /runAppShortcutCommand\('edit\.captureScreenshot'\)/)
  assert.match(commands, /edit\.captureScreenshot/)
  assert.match(commands, /dispatchScreenshotRequest/)
  assert.match(toolbar, /data-toolbar-action="capture-screenshot"/)
  assert.match(backend, /GLOBAL_SHORTCUT: &str = "Alt\+A"/)
  assert.match(nativeBrowser, /then_some\("edit\.captureScreenshot"\)/)
})

test('editor screenshot insertion reuses the existing image persistence flow', () => {
  const editor = read('src/components/Editor/CodeMirrorEditor.tsx')
  assert.match(editor, /buildImageMarkdown\(\[detail\.file\]/)
  assert.match(editor, /resolveScreenshotInsertionRange/)
  assert.match(editor, /insertImageMarkdown\(currentView/)
  assert.match(editor, /persistImageFilesAsMarkdown/)
  assert.match(editor, /persistDraftImageFilesAsMarkdown/)
})

test('all supported locales contain the complete screenshot surface', () => {
  const requiredPaths = [
    ['capture', 'command'],
    ['capture', 'commandDescription'],
    ['tools', 'select'],
    ['tools', 'crop'],
    ['tools', 'arrow'],
    ['tools', 'rectangle'],
    ['tools', 'text'],
    ['tools', 'mosaic'],
    ['actions', 'editText'],
    ['editor', 'textPlaceholder'],
    ['notices', 'shortcutConflictMessage'],
    ['notices', 'permissionDeniedMessage'],
    ['notices', 'documentChangedMessage'],
  ] as const

  for (const locale of ['en', 'ja', 'zh']) {
    const messages = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as Record<string, unknown>
    for (const [section, key] of requiredPaths) {
      const screenshot = messages.screenshot as Record<string, Record<string, unknown>>
      assert.equal(typeof screenshot?.[section]?.[key], 'string', `${locale}: screenshot.${section}.${key}`)
    }
  }
})

test('capture backend keeps pixels in memory until explicit release', () => {
  const backend = read('src-tauri/src/screenshot.rs')
  const controller = read('src/components/Screenshot/ScreenshotController.tsx')
  const overlay = read('src/components/Screenshot/ScreenshotOverlay.tsx')
  const capability = read('src-tauri/capabilities/screenshot.json')
  assert.match(backend, /ipc::Response/)
  assert.match(backend, /Response::new\(monitor\.image_bytes\.clone\(\)\)/)
  assert.match(backend, /fn encode_bmp/)
  assert.match(backend, /capture_monitor_pending/)
  assert.match(backend, /pub fn screenshot_hide_main[\s\S]*main\.hide\(\)/)
  assert.match(overlay, /overlay\.show\(\)[\s\S]*invoke\('screenshot_hide_main'\)/)
  assert.match(backend, /screenshot_capture_release/)
  assert.doesNotMatch(backend, /tempfile|NamedTempFile/)
  assert.match(controller, /const context = startsInPreview \? null : await requestEditorContext\(\)/)
  assert.match(overlay, /overlay\.show\(\)/)
  assert.match(capability, /core:window:allow-show/)
})

test('selection opens the icon annotation toolbar directly without an Annotate step', () => {
  const overlay = read('src/components/Screenshot/ScreenshotOverlay.tsx')
  const editor = read('src/components/Screenshot/ScreenshotEditor.tsx')
  const backend = read('src-tauri/src/screenshot.rs')
  assert.match(overlay, /onPointerUp[\s\S]*enterEditing\(nextSelection\)/)
  assert.match(overlay, /<ScreenshotEditor/)
  assert.doesNotMatch(overlay, /screenshot\.capture\.continue/)
  assert.match(editor, /const TOOL_ICONS =/)
  assert.match(editor, /role="toolbar"/)
  assert.match(editor, /aria-label=\{t\(`screenshot\.tools\.\$\{item\}`\)\}/)
  assert.doesNotMatch(editor, />\{t\(`screenshot\.tools\.\$\{item\}`\)\}<\/button>/)
  assert.match(backend, /screenshot_capture_finish/)
  assert.match(backend, /edit: Option<serde_json::Value>/)
})

test('Escape exits the complete capture and text input owns pointer and keyboard focus', () => {
  const editor = read('src/components/Screenshot/ScreenshotEditor.tsx')
  assert.match(editor, /if \(event\.key === 'Escape'\) \{[\s\S]*?onCancel\(\)/)
  assert.match(editor, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/)
  assert.match(editor, /autoFocus[\s\S]*z-30/)
})
