import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  buildBrowserTabLink,
  openWebUrlInNewBrowserTab,
} from '../src/lib/browser/openLinkInBrowserTab.ts'
import { useEditorStore } from '../src/store/editor.ts'

test('buildBrowserTabLink accepts only web URLs for internal browser tabs', () => {
  assert.deepEqual(buildBrowserTabLink('https://www.example.com/docs?q=1#top'), {
    url: 'https://www.example.com/docs?q=1#top',
    name: 'example.com',
  })
  assert.deepEqual(buildBrowserTabLink('http://localhost:3000/preview'), {
    url: 'http://localhost:3000/preview',
    name: 'localhost',
  })
  assert.deepEqual(buildBrowserTabLink(' https://example.com/trimmed '), {
    url: 'https://example.com/trimmed',
    name: 'example.com',
  })

  assert.equal(buildBrowserTabLink('mailto:support@example.com'), null)
  assert.equal(buildBrowserTabLink('tel:+81-90-1234-5678'), null)
  assert.equal(buildBrowserTabLink('./guide.md'), null)
  assert.equal(buildBrowserTabLink('javascript:alert(1)'), null)
})

test('openWebUrlInNewBrowserTab creates and activates a browser tab', () => {
  const tabId = openWebUrlInNewBrowserTab('https://qiita.com/500InternalServerError/items/b5bcd0e75e9184973ee5')
  assert.ok(tabId)

  const tab = useEditorStore.getState().tabs.find((candidate) => candidate.id === tabId)
  assert.ok(tab)
  assert.equal(tab.type, 'browser')
  assert.equal(tab.url, 'https://qiita.com/500InternalServerError/items/b5bcd0e75e9184973ee5')
  assert.equal(tab.name, 'qiita.com')
  assert.equal(useEditorStore.getState().activeTabId, tabId)

  useEditorStore.getState().closeTab(tabId)
})

test('preview and editor link handlers route web links to browser tabs before external openers', async () => {
  const [preview, editor] = await Promise.all([
    readFile(new URL('../src/components/Preview/MarkdownPreview.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Editor/editorLinkOpener.ts', import.meta.url), 'utf8'),
  ])

  const previewBrowserIndex = preview.indexOf('openWebUrlInNewBrowserTab(href)')
  const previewDialogIndex = preview.indexOf("import('@tauri-apps/plugin-dialog')")
  assert.ok(previewBrowserIndex >= 0)
  assert.ok(previewDialogIndex >= 0)
  assert.ok(previewBrowserIndex < previewDialogIndex)

  const editorBrowserIndex = editor.indexOf('openWebUrlInNewBrowserTab(link.url)')
  const editorOpenerIndex = editor.indexOf("import('@tauri-apps/plugin-opener')")
  assert.ok(editorBrowserIndex >= 0)
  assert.ok(editorOpenerIndex >= 0)
  assert.ok(editorBrowserIndex < editorOpenerIndex)
})
