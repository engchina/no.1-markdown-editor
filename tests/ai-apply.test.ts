import assert from 'node:assert/strict'
import test from 'node:test'
import { formatInsertBelowText, isAIApplySnapshotStale, resolveAIApplyChange } from '../src/lib/ai/apply.ts'

const snapshot = {
  tabId: 'tab-1',
  selectionFrom: 6,
  selectionTo: 11,
  anchorOffset: 11,
  blockFrom: 0,
  blockTo: 11,
  docText: 'hello world',
}

test('isAIApplySnapshotStale detects document drift', () => {
  assert.equal(isAIApplySnapshotStale(snapshot, 'hello world'), false)
  assert.equal(isAIApplySnapshotStale(snapshot, 'hello brave world'), true)
})

test('resolveAIApplyChange replaces the original selection when requested', () => {
  const change = resolveAIApplyChange('replace-selection', snapshot, snapshot.docText, 'universe')
  assert.deepEqual(change, {
    range: { from: 6, to: 11 },
    text: 'universe',
  })
})

test('resolveAIApplyChange inserts below the captured block with readable spacing', () => {
  const doc = 'First paragraph\ncontinues here\n\nSecond paragraph'
  const change = resolveAIApplyChange(
    'insert-below',
    {
      ...snapshot,
      blockFrom: 0,
      blockTo: 'First paragraph\ncontinues here'.length,
      docText: doc,
    },
    doc,
    'Inserted block'
  )

  assert.equal(change.range.from, 'First paragraph\ncontinues here'.length)
  assert.equal(change.range.to, 'First paragraph\ncontinues here'.length)
  assert.equal(change.text, '\n\nInserted block')
})

test('resolveAIApplyChange inserts at cursor without extra formatting', () => {
  const change = resolveAIApplyChange('at-cursor', snapshot, snapshot.docText, '!')
  assert.deepEqual(change, {
    range: { from: 11, to: 11 },
    text: '!',
  })
})

test('resolveAIApplyChange inserts under the captured heading before the next heading peer', () => {
  const doc = ['# Intro', '', 'First paragraph.', '', '## Next', '', 'Second paragraph.'].join('\n')
  const headingTo = doc.indexOf('## Next')
  const change = resolveAIApplyChange(
    'insert-under-heading',
    {
      ...snapshot,
      headingFrom: 0,
      headingTo,
      docText: doc,
    },
    doc,
    'Inserted under heading.'
  )

  assert.equal(change.range.from, headingTo)
  assert.equal(change.range.to, headingTo)
  assert.equal(change.text, 'Inserted under heading.\n\n')
})

test('resolveAIApplyChange rejects new-note targets because they do not mutate the current document', () => {
  assert.throws(
    () => resolveAIApplyChange('new-note', snapshot, snapshot.docText, '# Draft note'),
    /New note output must be handled outside the current document apply flow/u
  )
})

test('formatInsertBelowText preserves blank separation when needed', () => {
  assert.equal(formatInsertBelowText('Block one', 9, 'Block two'), '\n\nBlock two')
  assert.equal(formatInsertBelowText('Block one\n', 10, 'Block two'), '\nBlock two')
})
