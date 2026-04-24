import assert from 'node:assert/strict'
import test from 'node:test'
import { findInlineStrikethroughRanges } from '../src/components/Editor/wysiwygStrikethrough.ts'

test('findInlineStrikethroughRanges matches double-tilde spans', () => {
  assert.deepEqual(findInlineStrikethroughRanges('~~text~~'), [
    {
      from: 0,
      to: 8,
      contentFrom: 2,
      contentTo: 6,
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

test('findInlineStrikethroughRanges ignores single-tilde subscript spans', () => {
  assert.deepEqual(findInlineStrikethroughRanges('H~2~O'), [])
})

test('findInlineStrikethroughRanges ignores invalid marker combinations that do not form double-tilde pairs', () => {
  assert.deepEqual(findInlineStrikethroughRanges('a~b~~c~'), [])
})

test('findInlineStrikethroughRanges ignores escaped, invalid, code, math, and triple-tilde runs while keeping valid double-tilde spans', () => {
  assert.deepEqual(
    findInlineStrikethroughRanges(String.raw`\~text~ ~ text~ ~text ~ \`~code~\` $~math~$ foo~~~bar~~~baz ~~strike~~`),
    [
      {
        from: 60,
        to: 70,
        contentFrom: 62,
        contentTo: 68,
      },
    ]
  )
})
