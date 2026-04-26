import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('CodeMirrorEditor registers paste handling in the capture phase to beat flattened plain-text insertion', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /addEventListener\('paste', handlePaste, true\)/)
  assert.match(source, /removeEventListener\('paste', handlePaste, true\)/)
})

test('CodeMirrorEditor routes plain-text clipboard pastes through the shared markdown insertion flow with clipboard fallback', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(source, /const clipboardApi = typeof navigator === 'object' \? navigator\.clipboard : null/)
  assert.match(source, /readClipboardStringBestEffort\(clipboardData, 'text\/plain', clipboardApi\)/)
  assert.match(source, /readClipboardStringBestEffort\(clipboardData, 'text\/html', clipboardApi\)/)
  assert.match(source, /replaceSelectionWithMarkdown\(activeView, plainText\)/)
})

test('CodeMirrorEditor warns when pasted html contains closed details that the browser copied without a body', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /hasCollapsedDetailsWithOmittedBody/)
  assert.match(source, /const collapsedDetailsOmittedBody = \/<details\\b\/i\.test\(html\) && hasCollapsedDetailsWithOmittedBody\(html\)/)
  assert.match(
    source,
    /pushInfoNotice\('notices\.collapsedDetailsPasteTitle', 'notices\.collapsedDetailsPasteMessage'\)/
  )
})

test('collapsed details paste notice keys exist in all locales', async () => {
  const locales = ['en', 'zh', 'ja']
  for (const locale of locales) {
    const text = await readFile(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
    const json = JSON.parse(text) as { notices: Record<string, string> }

    assert.ok(json.notices.collapsedDetailsPasteTitle, `${locale}: collapsedDetailsPasteTitle`)
    assert.ok(json.notices.collapsedDetailsPasteMessage, `${locale}: collapsedDetailsPasteMessage`)
  }
})

test('CodeMirrorEditor aborts async paste writes when the original editor view is no longer active', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /const resolveActivePasteView = \(\): EditorView \| null => \{/)
  assert.match(source, /currentView !== view \|\| !currentView\.dom\.isConnected/)
})

test('replaceSelectionWithMarkdown normalizes \\r\\n to \\n before computing insertion length', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  // Windows clipboard returns \r\n plain text. CodeMirror strips \r when it splits
  // on /\r\n?|\n/, so without normalization the computed nextDocLength in
  // resolveSafeEditorInsertion would be too large and selectionAnchor would exceed
  // the real post-insertion doc length, triggering a RangeError.
  assert.match(source, /replace\(\/\\r\\n\?\/g, '\\n'\)/)
})
