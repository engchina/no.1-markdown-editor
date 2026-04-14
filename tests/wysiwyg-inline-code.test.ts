import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectInlineCodeRanges,
  findContainingTextRange,
} from '../src/components/Editor/wysiwygInlineCode.ts'

test('collectInlineCodeRanges finds single and multi-backtick code spans', () => {
  assert.deepEqual(
    collectInlineCodeRanges('Use `one` and ``two`` literally'),
    [
      { from: 4, to: 9 },
      { from: 14, to: 21 },
    ]
  )
})

test('findContainingTextRange resolves whether a marker is inside inline code', () => {
  const ranges = collectInlineCodeRanges('Use `one` and ``two`` literally')

  assert.deepEqual(findContainingTextRange(5, ranges), { from: 4, to: 9 })
  assert.deepEqual(findContainingTextRange(16, ranges), { from: 14, to: 21 })
  assert.equal(findContainingTextRange(0, ranges), null)
  assert.equal(findContainingTextRange(21, ranges), null)
})
