import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareMarkdownInsertion } from '../src/lib/markdownInsertion.ts'

test('prepareMarkdownInsertion leaves plain pasted text unchanged', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block'), {
    text: 'Pasted block',
    selectionOffset: 'Pasted block'.length,
  })
})

test('prepareMarkdownInsertion does not hop across an existing following newline', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block', '\nNext paragraph'), {
    text: 'Pasted block',
    selectionOffset: 'Pasted block'.length,
  })
})

test('prepareMarkdownInsertion preserves inserted trailing newlines exactly as provided', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block\n'), {
    text: 'Pasted block\n',
    selectionOffset: 'Pasted block\n'.length,
  })
})

test('prepareMarkdownInsertion ignores following CRLF because it no longer appends or skips line breaks', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block', '\r\nNext paragraph'), {
    text: 'Pasted block',
    selectionOffset: 'Pasted block'.length,
  })
})
