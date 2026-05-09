// Pure logic for split-mode source/preview scroll synchronization.
// All DOM access happens in callers (the React hook); this module is data-only
// so it can be unit-tested without jsdom.

export interface SourceLineEntry {
  line: number
  offsetTop: number
  offsetHeight: number
}

export interface SourceLineMap {
  entries: SourceLineEntry[]
}

export function buildSourceLineMap(entries: readonly SourceLineEntry[]): SourceLineMap {
  const filtered = entries.filter(
    (entry) =>
      Number.isFinite(entry.line) &&
      entry.line >= 1 &&
      Number.isFinite(entry.offsetTop) &&
      Number.isFinite(entry.offsetHeight)
  )
  filtered.sort((a, b) => a.offsetTop - b.offsetTop)
  return { entries: filtered }
}

function searchByOffsetTop(entries: readonly SourceLineEntry[], scrollTop: number): number {
  // Largest index with entries[i].offsetTop <= scrollTop. Returns -1 if none.
  let lo = 0
  let hi = entries.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (entries[mid].offsetTop <= scrollTop) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

function searchByLine(entries: readonly SourceLineEntry[], line: number): number {
  // Largest index with entries[i].line <= line. Returns -1 if none.
  // Lines correlate with offsetTop in practice, so a linear scan is simple
  // and avoids assumptions about strict monotonicity.
  let best = -1
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].line <= line) best = i
    else break
  }
  return best
}

export interface LineLookup {
  line: number
  fraction: number
}

export function lineFromScrollTop(map: SourceLineMap, scrollTop: number): LineLookup {
  const { entries } = map
  if (entries.length === 0) return { line: 1, fraction: 0 }

  if (scrollTop <= entries[0].offsetTop) {
    return { line: entries[0].line, fraction: 0 }
  }

  const index = searchByOffsetTop(entries, scrollTop)
  if (index < 0) return { line: entries[0].line, fraction: 0 }

  const current = entries[index]
  const next = entries[index + 1]
  const span = next ? next.offsetTop - current.offsetTop : current.offsetHeight
  if (!Number.isFinite(span) || span <= 0) return { line: current.line, fraction: 0 }

  const fraction = clamp01((scrollTop - current.offsetTop) / span)
  return { line: current.line, fraction }
}

export function scrollTopForLine(map: SourceLineMap, lookup: LineLookup): number {
  const { entries } = map
  if (entries.length === 0) return 0

  if (lookup.line <= entries[0].line) return entries[0].offsetTop

  const index = searchByLine(entries, lookup.line)
  if (index < 0) return entries[0].offsetTop

  const current = entries[index]
  const next = entries[index + 1]
  const fraction = clamp01(lookup.fraction)

  if (current.line === lookup.line || !next) {
    const span = next ? next.offsetTop - current.offsetTop : current.offsetHeight
    if (!Number.isFinite(span) || span <= 0) return current.offsetTop
    return current.offsetTop + span * fraction
  }

  // Target line falls between two annotated lines — interpolate linearly.
  const lineSpan = next.line - current.line
  if (lineSpan <= 0) return current.offsetTop
  const offsetSpan = next.offsetTop - current.offsetTop
  const lineProgress = (lookup.line - current.line + fraction) / lineSpan
  return current.offsetTop + offsetSpan * clamp01(lineProgress)
}

export type ScrollSyncSource = 'editor' | 'preview'

export interface ScrollSyncGuard {
  // Returns true when `source` is allowed to drive the other side now.
  // False when the other side has driven sync within the cooldown window.
  canDrive(source: ScrollSyncSource): boolean
  // Mark `source` as having just driven sync.
  noteDrove(source: ScrollSyncSource): void
}

export function createScrollSyncGuard(
  cooldownMs: number,
  getNow: () => number = () => Date.now()
): ScrollSyncGuard {
  let lastEditor = Number.NEGATIVE_INFINITY
  let lastPreview = Number.NEGATIVE_INFINITY

  return {
    canDrive(source) {
      const otherTimestamp = source === 'editor' ? lastPreview : lastEditor
      return getNow() - otherTimestamp >= cooldownMs
    },
    noteDrove(source) {
      const now = getNow()
      if (source === 'editor') lastEditor = now
      else lastPreview = now
    },
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
