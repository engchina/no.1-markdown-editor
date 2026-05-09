import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSourceLineMap,
  createScrollSyncGuard,
  lineFromScrollTop,
  scrollTopForLine,
  type SourceLineEntry,
} from '../src/lib/scrollSync.ts'

const FIXTURE: SourceLineEntry[] = [
  { line: 1, offsetTop: 0, offsetHeight: 40 },     // h1
  { line: 3, offsetTop: 40, offsetHeight: 80 },    // p
  { line: 7, offsetTop: 120, offsetHeight: 160 },  // long math block (lines 7-9)
  { line: 11, offsetTop: 280, offsetHeight: 60 },  // p
  { line: 13, offsetTop: 340, offsetHeight: 100 }, // pre
]

test('buildSourceLineMap sorts entries by offsetTop and drops invalid rows', () => {
  const map = buildSourceLineMap([
    { line: 5, offsetTop: 100, offsetHeight: 20 },
    { line: 2, offsetTop: 30, offsetHeight: 20 },
    { line: 0, offsetTop: 60, offsetHeight: 20 }, // invalid: line < 1
    { line: NaN, offsetTop: 80, offsetHeight: 20 }, // invalid: NaN line
    { line: 3, offsetTop: 50, offsetHeight: 20 },
  ])

  assert.deepEqual(
    map.entries.map((entry) => entry.line),
    [2, 3, 5]
  )
})

test('lineFromScrollTop returns the first line when scrollTop is at the top', () => {
  const map = buildSourceLineMap(FIXTURE)
  assert.deepEqual(lineFromScrollTop(map, 0), { line: 1, fraction: 0 })
})

test('lineFromScrollTop returns the active line at a given scroll position', () => {
  const map = buildSourceLineMap(FIXTURE)

  // scrollTop=120 -> exactly the start of the long math block (line 7)
  const result = lineFromScrollTop(map, 120)
  assert.equal(result.line, 7)
  assert.equal(result.fraction, 0)
})

test('lineFromScrollTop computes the fraction within an element', () => {
  const map = buildSourceLineMap(FIXTURE)

  // scrollTop=200 is halfway into the math block (offsetTop=120, span=160)
  const result = lineFromScrollTop(map, 200)
  assert.equal(result.line, 7)
  assert.ok(Math.abs(result.fraction - 0.5) < 0.01, `expected ~0.5, got ${result.fraction}`)
})

test('lineFromScrollTop never returns a line above the first entry when scrolling above', () => {
  const map = buildSourceLineMap(FIXTURE)

  const result = lineFromScrollTop(map, -50)
  assert.equal(result.line, 1)
  assert.equal(result.fraction, 0)
})

test('scrollTopForLine returns the entry offset for an exact line match', () => {
  const map = buildSourceLineMap(FIXTURE)

  assert.equal(scrollTopForLine(map, { line: 1, fraction: 0 }), 0)
  assert.equal(scrollTopForLine(map, { line: 11, fraction: 0 }), 280)
})

test('scrollTopForLine interpolates between two entries when target line is in a gap', () => {
  const map = buildSourceLineMap(FIXTURE)

  // Line 5 is between entry line 3 (offsetTop=40) and line 7 (offsetTop=120).
  // lineProgress = (5 - 3) / (7 - 3) = 0.5 -> halfway between -> offsetTop=80
  const result = scrollTopForLine(map, { line: 5, fraction: 0 })
  assert.equal(result, 80)
})

test('scrollTopForLine and lineFromScrollTop round-trip on annotated boundaries', () => {
  const map = buildSourceLineMap(FIXTURE)

  for (const entry of FIXTURE) {
    const lookup = lineFromScrollTop(map, entry.offsetTop)
    const scrolledTop = scrollTopForLine(map, lookup)
    assert.equal(scrolledTop, entry.offsetTop, `round-trip failed for line ${entry.line}`)
  }
})

test('scrollTopForLine clamps to the first entry when target line is before any entry', () => {
  const map = buildSourceLineMap(FIXTURE)
  assert.equal(scrollTopForLine(map, { line: 0, fraction: 0 }), 0)
})

test('scrollTopForLine handles target line beyond the last entry', () => {
  const map = buildSourceLineMap(FIXTURE)

  // Target line 99 is past the last entry (line 13, offsetTop=340, height=100)
  // With no `next`, span falls back to offsetHeight=100, fraction=0 -> stays at 340
  const result = scrollTopForLine(map, { line: 99, fraction: 0 })
  assert.equal(result, 340)
})

test('createScrollSyncGuard allows the first scroll from either side', () => {
  const guard = createScrollSyncGuard(150, () => 0)

  assert.equal(guard.canDrive('editor'), true)
  assert.equal(guard.canDrive('preview'), true)
})

test('createScrollSyncGuard blocks the other side during cooldown', () => {
  let now = 1000
  const guard = createScrollSyncGuard(150, () => now)

  guard.noteDrove('editor')
  // Preview's scroll event right after editor drove sync — should be blocked
  now = 1050
  assert.equal(guard.canDrive('preview'), false)
  // Editor itself can keep driving (it owns the lock)
  assert.equal(guard.canDrive('editor'), true)
})

test('createScrollSyncGuard releases after cooldown expires', () => {
  let now = 1000
  const guard = createScrollSyncGuard(150, () => now)

  guard.noteDrove('editor')
  now = 1200 // 200ms later, past 150ms cooldown
  assert.equal(guard.canDrive('preview'), true)
})

test('createScrollSyncGuard handles alternating sides without deadlock', () => {
  let now = 0
  const guard = createScrollSyncGuard(150, () => now)

  guard.noteDrove('editor')
  now = 200
  assert.equal(guard.canDrive('preview'), true)
  guard.noteDrove('preview')
  now = 400
  assert.equal(guard.canDrive('editor'), true)
})
