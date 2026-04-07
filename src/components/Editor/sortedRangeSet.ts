import { RangeSetBuilder, type RangeSet, type RangeValue } from '@codemirror/state'

export interface RangeSpec<T extends RangeValue> {
  from: number
  to: number
  value: T
}

export function compareRangeSpecs<T extends RangeValue>(a: RangeSpec<T>, b: RangeSpec<T>): number {
  return (
    a.from - b.from ||
    a.value.startSide - b.value.startSide ||
    a.to - b.to ||
    a.value.endSide - b.value.endSide
  )
}

export function buildSortedRangeSet<T extends RangeValue>(ranges: readonly RangeSpec<T>[]): RangeSet<T> {
  const builder = new RangeSetBuilder<T>()

  for (const { from, to, value } of [...ranges].sort(compareRangeSpecs)) {
    builder.add(from, to, value)
  }

  return builder.finish()
}
