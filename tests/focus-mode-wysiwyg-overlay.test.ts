import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('selectEffectiveWysiwygMode is exported from store/editor and ORs focusMode with wysiwygMode', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(store, /export function selectEffectiveWysiwygMode\(/)
  assert.match(
    store,
    /export function selectEffectiveWysiwygMode\([^)]*\): boolean \{\s*return s\.wysiwygMode \|\| s\.focusMode\s*\}/,
  )
})

test('CodeMirrorEditor reads WYSIWYG state via selectEffectiveWysiwygMode (so F11 forces it on)', async () => {
  const editor = await readFile(
    new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url),
    'utf8',
  )

  assert.match(editor, /selectEffectiveWysiwygMode/)
  assert.match(
    editor,
    /const wysiwygMode = useEditorStore\(selectEffectiveWysiwygMode\)/,
  )
  assert.doesNotMatch(
    editor,
    /useEditorStore\(\(state\) => state\.wysiwygMode\)/,
    'CodeMirrorEditor must not read raw wysiwygMode for rendering — that would skip the focus-mode overlay',
  )
})

test('App.tsx error-boundary resetKeys include focusMode so the editor pane reconfigures on F11', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(
    app,
    /resetKeys=\{\[activeTab\?\.id \?\? '', viewMode, wysiwygMode, focusMode\]\}/,
  )
})

test('focus-mode WYSIWYG overlay does not mutate the persisted wysiwygMode setter', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  // setFocusMode must remain a plain setter — it must NOT touch wysiwygMode.
  assert.match(store, /setFocusMode: \(focusMode\) => set\(\{ focusMode \}\)/)
})
