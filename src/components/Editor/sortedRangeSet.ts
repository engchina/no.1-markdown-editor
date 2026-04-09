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

  for (const range of [...ranges].filter(isValidRangeSpec).sort(compareRangeSpecs)) {
    try {
      builder.add(range.from, range.to, range.value)
    } catch {
      // Formatting glitches should degrade gracefully instead of taking down the editor.
    }
  }

  return builder.finish()
}

function isValidRangeSpec<T extends RangeValue>(range: RangeSpec<T>): boolean {
  return (
    Number.isFinite(range.from) &&
    Number.isFinite(range.to) &&
    range.from >= 0 &&
    range.to >= range.from
  )
}
