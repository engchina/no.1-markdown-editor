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

test('CodeMirrorEditor aborts async paste writes when the original editor view is no longer active', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /const resolveActivePasteView = \(\): EditorView \| null => \{/)
  assert.match(source, /currentView !== view \|\| !currentView\.dom\.isConnected/)
})
