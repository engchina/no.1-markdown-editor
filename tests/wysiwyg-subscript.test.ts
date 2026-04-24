import assert from 'node:assert/strict'
import test from 'node:test'
import { findInlineSubscriptRanges } from '../src/components/Editor/wysiwygSubscript.ts'

test('findInlineSubscriptRanges matches single-tilde spans inside words', () => {
  assert.deepEqual(findInlineSubscriptRanges('H~2~O'), [
    {
      from: 1,
      to: 4,
      contentFrom: 2,
      contentTo: 3,
    },
  ])
})

test('findInlineSubscriptRanges preserves nested inline formatting inside single-tilde spans', () => {
  assert.deepEqual(findInlineSubscriptRanges('~**bold**~'), [
    {
      from: 0,
      to: 10,
      contentFrom: 1,
      contentTo: 9,
    },
  ])
})

test('findInlineSubscriptRanges ignores escaped, invalid, code, math, and multi-tilde runs', () => {
  assert.deepEqual(
    findInlineSubscriptRanges(String.raw`\~text~ ~ text~ ~text ~ \`~code~\` $~math~$ ~~strike~~ foo~~~bar~~~baz`),
    []
  )
})
