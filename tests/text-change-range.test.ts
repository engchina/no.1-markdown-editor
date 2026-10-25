import assert from 'node:assert/strict'
import test from 'node:test'
import { diffTextChangeRange } from '../src/lib/lineDiff.ts'

function apply(previous: string, next: string): string {
  const { from, to, insert } = diffTextChangeRange(previous, next)
  return previous.slice(0, from) + insert + previous.slice(to)
}

test('diffTextChangeRange replaces only the changed span', () => {
  assert.deepEqual(diffTextChangeRange('# A\n\nold line\n\ntail', '# A\n\nnew line\n\ntail'), {
    from: 5,
    to: 8,
    insert: 'new',
  })
})

test('diffTextChangeRange handles insertions, deletions and identical text', () => {
  assert.deepEqual(diffTextChangeRange('abc', 'abXc'), { from: 2, to: 2, insert: 'X' })
  assert.deepEqual(diffTextChangeRange('abXc', 'abc'), { from: 2, to: 3, insert: '' })
  assert.deepEqual(diffTextChangeRange('same', 'same'), { from: 4, to: 4, insert: '' })
  assert.deepEqual(diffTextChangeRange('', 'new'), { from: 0, to: 0, insert: 'new' })
})

test('diffTextChangeRange never lets prefix and suffix overlap on repeated text', () => {
  for (const [previous, next] of [
    ['aaaa', 'aa'],
    ['aa', 'aaaa'],
    ['abab', 'ab'],
    ['x\nx\nx', 'x\nx'],
  ]) {
    assert.equal(apply(previous, next), next)
  }
})
