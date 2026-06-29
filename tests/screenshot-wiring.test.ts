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
  const cargo = read('src-tauri/Cargo.toml')
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
  assert.match(cargo, /cfg\(any\(target_os = \\"macos\\", windows\)\)[\s\S]*xcap = "=0\.8\.0"/)
  assert.match(cargo, /cfg\(target_os = \\"linux\\"\)[\s\S]*x11rb =/)
  assert.match(backend, /x11_capture::monitors/)
  assert.doesNotMatch(backend, /tempfile|NamedTempFile/)
  assert.match(controller, /const context = startsInPreview \? null : await requestEditorContext\(\)/)
  assert.match(overlay, /overlay\.show\(\)/)
  assert.match(capability, /core:window:allow-show/)
})

test('overlay windows are pooled and reused across captures, not rebuilt per shot', () => {
  const backend = read('src-tauri/src/screenshot.rs')
  const overlay = read('src/components/Screenshot/ScreenshotOverlay.tsx')
  const capability = read('src-tauri/capabilities/screenshot.json')
  const lib = read('src-tauri/src/lib.rs')
  // Warm pool: build once per layout, hide (not destroy) between captures.
  assert.match(backend, /struct OverlayPool/)
  assert.match(backend, /fn ensure_overlay_windows/)
  assert.match(backend, /fn hide_overlay_windows/)
  assert.match(backend, /fn layout_signature/)
  assert.match(lib, /OverlayPoolState::default\(\)/)
  // The unconditional 16ms pre-capture sleep that gated every screenshot is gone.
  assert.doesNotMatch(backend, /thread::sleep/)
  // Session id travels per-capture via an event + a mount query, not the URL.
  assert.match(backend, /SCREENSHOT_OVERLAY_BEGIN_EVENT/)
  assert.match(backend, /fn screenshot_active_session/)
  assert.doesNotMatch(backend, /screenshotOverlay=1&sessionId=/)
  assert.match(overlay, /TAURI_SCREENSHOT_OVERLAY_BEGIN_EVENT/)
  assert.match(overlay, /screenshot_active_session/)
  // Hiding warm windows requires the hide permission.
  assert.match(capability, /core:window:allow-hide/)
})

test('overlay offers quick output and window-region grabbing', () => {
  const editor = read('src/components/Screenshot/ScreenshotEditor.tsx')
  const overlay = read('src/components/Screenshot/ScreenshotOverlay.tsx')
  const backend = read('src-tauri/src/screenshot.rs')
  // Copy goes through the OS clipboard plugin (navigator.clipboard image writes
  // are blocked in the Tauri webview); save grants fs scope then writes.
  const capability = read('src-tauri/capabilities/screenshot.json')
  assert.match(editor, /renderScreenshotCanvas/)
  // Copy sends raw RGBA as the whole payload (octet-stream fast path), not via a
  // JSON-wrapped object which is seconds-slow for large images.
  assert.match(editor, /screenshot_copy_image/)
  assert.match(editor, /new Uint8Array\(rgba\.buffer/)
  assert.match(backend, /fn screenshot_copy_image[\s\S]*?InvokeBody::Raw/)
  assert.match(editor, /ensureFsPathAccess/)
  assert.match(editor, /writeFile/)
  assert.match(editor, /screenshot\.actions\.copy/)
  assert.match(editor, /screenshot\.actions\.save/)
  assert.match(capability, /clipboard-manager:allow-write-image/)
  assert.match(capability, /dialog:allow-save/)
  assert.match(capability, /fs:allow-write-file/)
  // Pixel-accurate magnifier + window detection.
  assert.match(overlay, /loupeCanvasRef/)
  assert.match(overlay, /findWindowAt/)
  assert.match(overlay, /screenshot_window_rects/)
  assert.match(backend, /fn screenshot_window_rects/)
  assert.match(backend, /fn enumerate_window_rects/)
  // Copy parks (minimizes) the editor instead of raising it; Enter inserts.
  assert.match(backend, /fn screenshot_capture_dismiss[\s\S]*?park_main_window/)
  assert.match(overlay, /screenshot_capture_dismiss/)
  assert.match(editor, /onCopyDismiss/)
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
  assert.match(editor, /event\.key === 'Enter' && interactiveControl/)
  assert.match(editor, /if \(event\.key === 'Enter'\) \{[\s\S]*?void confirm\(\)/)
  assert.match(editor, /event\.key === ' ' && !primary && !interactiveControl[\s\S]*?createDefaultAnnotation\(tool\)/)
  assert.match(editor, /aria-keyshortcuts="Enter"/)
  assert.match(editor, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/)
  assert.match(editor, /autoFocus[\s\S]*z-30/)
})
