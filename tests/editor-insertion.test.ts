import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSafeEditorInsertion } from '../src/lib/editorInsertion.ts'

test('resolveSafeEditorInsertion preserves an in-bounds range and selection anchor', () => {
  assert.deepEqual(resolveSafeEditorInsertion(24, { from: 6, to: 10 }, 5, 11), {
    range: { from: 6, to: 10 },
    selectionAnchor: 11,
  })
})

test('resolveSafeEditorInsertion clamps an out-of-bounds range and selection anchor to the next document size', () => {
  assert.deepEqual(resolveSafeEditorInsertion(12, { from: 18, to: 30 }, 4, 99), {
    range: { from: 12, to: 12 },
    selectionAnchor: 16,
  })
})

test('resolveSafeEditorInsertion normalizes reversed ranges before computing the final anchor clamp', () => {
  assert.deepEqual(resolveSafeEditorInsertion(15, { from: 11, to: 4 }, 3, -20), {
    range: { from: 4, to: 11 },
    selectionAnchor: 0,
  })
})
