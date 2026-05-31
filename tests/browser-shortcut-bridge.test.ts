import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('browser child webview forwards app-level shortcuts to the shared shortcut runner', async () => {
  const [app, rust, cargo, shortcutTypes] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/browser/shortcuts.ts', import.meta.url), 'utf8'),
  ])

  assert.match(shortcutTypes, /APP_BROWSER_SHORTCUT_EVENT = 'app-browser-shortcut'/)
  assert.match(shortcutTypes, /export type AppBrowserShortcutCommand =/)
  assert.match(shortcutTypes, /\| 'file\.close'/)
  assert.match(shortcutTypes, /\| 'browser\.new'/)
  assert.match(shortcutTypes, /\| 'view\.zoomReset'/)

  assert.match(app, /const runAppShortcutCommand = useCallback\(/)
  assert.match(app, /listen<AppBrowserShortcutPayload>\(APP_BROWSER_SHORTCUT_EVENT/)
  assert.match(app, /runAppShortcutCommand\(event\.payload\.command, \{ repeat: event\.payload\.repeat \}\)/)
  assert.match(app, /case 'file\.new':[\s\S]*newFile\(\)/)
  assert.match(app, /case 'file\.open':[\s\S]*void openFile\(\)/)
  assert.match(app, /case 'file\.save':[\s\S]*void saveFile\(\)/)
  assert.match(app, /case 'file\.saveAs':[\s\S]*void saveFileAs\(\)/)
  assert.match(app, /case 'browser\.new':[\s\S]*addTab\(\{ type: 'browser'/)

  assert.match(cargo, /"Win32_UI_Input_KeyboardAndMouse"/)
  assert.match(rust, /const APP_BROWSER_SHORTCUT_EVENT: &str = "app-browser-shortcut"/)
  assert.match(rust, /struct BrowserShortcutPayload/)
  assert.match(rust, /fn resolve_browser_accelerator_shortcut\(/)
  assert.match(rust, /AcceleratorKeyPressedEventHandler/)
  assert.match(rust, /\.zoom_hotkeys_enabled\(false\)/)
  assert.match(rust, /args\.SetHandled\(true\)/)
  assert.match(rust, /app_handle\.emit\(\s*APP_BROWSER_SHORTCUT_EVENT/)
  assert.match(rust, /attach_browser_shortcut_handler\(app_handle_shortcuts, &child\)\?/)

  const expectedMappings = [
    ['VK_N', 'file.new'],
    ['VK_O', 'file.open'],
    ['VK_S', 'file.save'],
    ['VK_S', 'file.saveAs'],
    ['VK_W', 'file.close'],
    ['VK_T', 'browser.new'],
    ['VK_P', 'file.switchOpen'],
    ['VK_P', 'view.commandPalette'],
    ['VK_J', 'ai.open'],
    ['VK_J', 'ai.setup'],
    ['VK_H', 'edit.imageHosting'],
    ['VK_OEM_2', 'help.keyboardShortcuts'],
    ['VK_OEM_5', 'view.toggleSidebar'],
    ['VK_OEM_COMMA', 'view.appearance'],
    ['VK_OEM_PLUS', 'view.zoomIn'],
    ['VK_OEM_MINUS', 'view.zoomOut'],
    ['VK_0', 'view.zoomReset'],
    ['VK_F11', 'view.toggleFocus'],
  ]

  for (const [key, command] of expectedMappings) {
    assert.match(rust, new RegExp(`${key}[\\s\\S]*Some\\("${command.replace('.', '\\.')}"\\)`))
  }
})
