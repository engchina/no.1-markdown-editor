import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('CodeMirrorEditor scrolls inserted markdown into view when it updates the selection', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /appendEditorSelectionScrollEffect\(view, options\.effects, selectionAnchor\)/)
  assert.match(editor, /keepEditorCursorBottomGap\(view\)/)
})

test('insertMarkdown re-dispatches scroll effect after double rAF so off-screen content gets correct coordinates', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  // The double-rAF block must re-dispatch a fresh scrollIntoView effect so that
  // CodeMirror applies it after rendering the new content (fixes async image paste scroll).
  assert.match(editor, /requestAnimationFrame[\s\S]*?requestAnimationFrame[\s\S]*?appendEditorSelectionScrollEffect\(view, undefined, selectionAnchor\)/)
})

test('accepted AI ghost text scrolls the new cursor position into view', async () => {
  const ghost = await readFile(new URL('../src/lib/ai/ghostText.ts', import.meta.url), 'utf8')

  assert.match(ghost, /appendEditorSelectionScrollEffect\(view, \[/)
})

test('editor scroll helper keeps three line-heights below the cursor', async () => {
  const helper = await readFile(new URL('../src/lib/editorScroll.ts', import.meta.url), 'utf8')

  assert.match(helper, /EDITOR_CURSOR_SCROLL_LINES = 3/)
  assert.match(helper, /view\.defaultLineHeight \* EDITOR_CURSOR_SCROLL_LINES/)
})

test('editor and preview share a bottom buffer so end-of-document content can lift off the viewport edge', async () => {
  const css = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(css, /--document-bottom-buffer:\s*5\.4em;/)
  assert.match(css, /\.cm-content\s*\{[\s\S]*?padding:\s*24px 0 var\(--document-bottom-buffer\) !important;/)
  assert.match(css, /\.focus-mode-container \.cm-content\s*\{[\s\S]*?padding:\s*24px 0 var\(--document-bottom-buffer\) !important;/)
  assert.match(css, /\.markdown-preview\s*\{[\s\S]*?padding:\s*32px 48px var\(--document-bottom-buffer\);/)
})
