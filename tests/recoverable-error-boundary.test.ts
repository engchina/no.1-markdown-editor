import assert from 'node:assert/strict'
import test from 'node:test'
import { areResetKeysEqual } from '../src/components/ErrorBoundary/RecoverableErrorBoundary.ts'

test('areResetKeysEqual performs shallow reset key comparisons with Object.is semantics', () => {
  assert.equal(areResetKeysEqual([1, 'a', null], [1, 'a', null]), true)
  assert.equal(areResetKeysEqual([NaN], [Number.NaN]), true)
  assert.equal(areResetKeysEqual([0], [-0]), false)
  assert.equal(areResetKeysEqual([1, 2], [1]), false)
  assert.equal(areResetKeysEqual([1, 2], [1, 3]), false)
})
