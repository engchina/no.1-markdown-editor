import assert from 'node:assert/strict'
import test from 'node:test'
import { findInlineStrikethroughRanges } from '../src/components/Editor/wysiwygStrikethrough.ts'

test('findInlineStrikethroughRanges matches single-tilde spans inside words', () => {
  assert.deepEqual(findInlineStrikethroughRanges('H~2~O'), [
    {
      from: 1,
      to: 4,
      contentFrom: 2,
      contentTo: 3,
    },
  ])
})

test('findInlineStrikethroughRanges preserves nested inline formatting inside double-tilde spans', () => {
  assert.deepEqual(findInlineStrikethroughRanges('~~**bold**~~'), [
    {
      from: 0,
      to: 12,
      contentFrom: 2,
      contentTo: 10,
    },
  ])
})

test('findInlineStrikethroughRanges pairs only same-length tilde sequences', () => {
  assert.deepEqual(findInlineStrikethroughRanges('a~b~~c~'), [
    {
      from: 1,
      to: 7,
      contentFrom: 2,
      contentTo: 6,
    },
  ])
})

test('findInlineStrikethroughRanges ignores escaped, invalid, code, math, and triple-tilde runs', () => {
  assert.deepEqual(
    findInlineStrikethroughRanges(String.raw`\~text~ ~ text~ ~text ~ \`~code~\` $~math~$ foo~~~bar~~~baz`),
    []
  )
})
