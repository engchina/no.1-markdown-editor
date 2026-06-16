import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  getBrowserWebviewLabel,
  getBrowserWebviewLabels,
} from '../src/lib/browser/webviewVisibility.ts'

test('browser webview visibility helpers derive labels only for browser tabs', () => {
  assert.equal(getBrowserWebviewLabel('tab-1'), 'browser-tab-1')
  assert.deepEqual(
    getBrowserWebviewLabels([
      { id: 'markdown-1', type: 'markdown' },
      { id: 'browser-1', type: 'browser' },
      { id: 'legacy-markdown' },
      { id: 'browser-2', type: 'browser' },
    ]),
    ['browser-browser-1', 'browser-browser-2']
  )
})

test('BrowserContainer only shows a native browser webview while its tab remains active', async () => {
  const source = await readFile(new URL('../src/components/Browser/BrowserContainer.tsx', import.meta.url), 'utf8')

  assert.match(source, /const isActiveBrowserTab = \(\) =>\s*active && useEditorStore\.getState\(\)\.activeTabId === tab\.id/)
  assert.match(source, /if \(!isActiveBrowserTab\(\)\) return/)
  assert.match(
    source,
    /if \(!isActiveBrowserTab\(\)\) \{\s*await invoke\('show_browser_webview', \{ label, visible: false \}\)\s*return\s*\}/
  )
  assert.ok(
    source.indexOf("await invoke('create_browser_webview'") <
      source.indexOf("await invoke('show_browser_webview', { label, visible: true })"),
    'browser webviews should be created/repositioned before they can be shown'
  )
})
