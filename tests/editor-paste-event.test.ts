import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('CodeMirrorEditor registers paste handling in the capture phase to beat flattened plain-text insertion', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /addEventListener\('paste', handlePaste, true\)/)
  assert.match(source, /removeEventListener\('paste', handlePaste, true\)/)
})
