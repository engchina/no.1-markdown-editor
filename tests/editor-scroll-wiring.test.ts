import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('CodeMirrorEditor scrolls inserted markdown into view when it updates the selection', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /scrollIntoView: options\.scrollIntoView \?\? true/)
})

test('accepted AI ghost text scrolls the new cursor position into view', async () => {
  const ghost = await readFile(new URL('../src/lib/ai/ghostText.ts', import.meta.url), 'utf8')

  assert.match(ghost, /scrollIntoView: true/)
})
