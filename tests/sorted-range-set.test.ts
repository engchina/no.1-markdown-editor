import assert from 'node:assert/strict'
import test from 'node:test'
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import { buildSortedRangeSet } from '../src/components/Editor/sortedRangeSet.ts'

test('buildSortedRangeSet stabilizes mixed replace and mark decorations at the same position', () => {
  const ranges = [
    { from: 0, to: 12, value: Decoration.mark({ class: 'cm-wysiwyg-blockquote' }) },
    { from: 0, to: 2, value: Decoration.replace({}) },
  ]

  assert.throws(() => {
    const builder = new RangeSetBuilder<Decoration>()
    for (const range of ranges) {
      builder.add(range.from, range.to, range.value)
    }
    builder.finish()
  }, /Ranges must be added sorted/)

  const set = buildSortedRangeSet(ranges)
  const seen: Array<{ from: number; to: number; startSide: number }> = []
  set.between(0, 12, (from, to, value) => {
    seen.push({ from, to, startSide: value.startSide })
  })

  assert.equal(seen.length, 2)
  assert.deepEqual(
    seen.map(({ from, to, startSide }) => ({ from, to, startSide })),
    [
      { from: 0, to: 2, startSide: Decoration.replace({}).startSide },
      { from: 0, to: 12, startSide: Decoration.mark({ class: 'cm-wysiwyg-blockquote' }).startSide },
    ]
  )
})
