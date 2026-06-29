import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampScreenshotRect,
  normalizeScreenshotRect,
  offsetFromLineColumn,
  resolveScreenshotInsertionRange,
  type ScreenshotInsertionTarget,
} from '../src/lib/screenshot.ts'
import {
  annotationBounds,
  createScreenshotEditSnapshot,
  drawScreenshotRasterPreview,
  moveAnnotation,
  moveScreenshotCrop,
  removeAnnotation,
  resizeAnnotation,
  resizeScreenshotCrop,
  screenshotToolForKey,
  updateAnnotation,
  type ArrowAnnotation,
  type RectangleAnnotation,
} from '../src/components/Screenshot/screenshotModel.ts'

const target: ScreenshotInsertionTarget = {
  tabId: 'tab-1',
  tabPath: 'C:\\notes\\example.md',
  docText: 'before selected after',
  selectionFrom: 7,
  selectionTo: 15,
  anchorOffset: 15,
  scrollTop: 120,
  scrollLeft: 3,
}

test('screenshot rectangles normalize and clamp to original pixels', () => {
  assert.deepEqual(normalizeScreenshotRect({ x: 80, y: 70 }, { x: 20, y: 10 }), {
    x: 20,
    y: 10,
    width: 60,
    height: 60,
  })
  assert.deepEqual(clampScreenshotRect({ x: 90, y: 45, width: 30, height: 20 }, 100, 50), {
    x: 90,
    y: 45,
    width: 10,
    height: 5,
  })
})

test('crop handles resize from every edge and moving keeps its size at image bounds', () => {
  const crop = { x: 20, y: 10, width: 60, height: 40 }
  assert.deepEqual(resizeScreenshotCrop(crop, 'nw', { x: 5, y: 4 }, 100, 80), {
    x: 5,
    y: 4,
    width: 75,
    height: 46,
  })
  assert.deepEqual(resizeScreenshotCrop(crop, 'se', { x: 120, y: 90 }, 100, 80), {
    x: 20,
    y: 10,
    width: 80,
    height: 70,
  })
  assert.deepEqual(moveScreenshotCrop(crop, 90, 80, 100, 80), {
    x: 40,
    y: 40,
    width: 60,
    height: 40,
  })
})

test('unchanged documents replace the captured selection', () => {
  assert.deepEqual(resolveScreenshotInsertionRange(target, target.docText), {
    from: 7,
    to: 15,
    stale: false,
  })
})

test('changed documents preserve text and insert at a safe original anchor', () => {
  assert.deepEqual(resolveScreenshotInsertionRange(target, 'short'), {
    from: 5,
    to: 5,
    stale: true,
  })
})

test('line and column fallback maps to a legal document offset', () => {
  assert.equal(offsetFromLineColumn('first\nsecond\nthird', 2, 3), 9)
  assert.equal(offsetFromLineColumn('first', 99, 99), 5)
})

test('annotation tool shortcuts cover the complete keyboard tool set', () => {
  assert.deepEqual(
    ['C', 'A', 'R', 'T', 'M', 'V'].map(screenshotToolForKey),
    ['crop', 'arrow', 'rectangle', 'text', 'mosaic', 'select']
  )
  assert.equal(screenshotToolForKey('x'), null)
})

test('annotation history operations move, resize, update, and delete objects', () => {
  const annotation: RectangleAnnotation = {
    id: 'rect-1',
    type: 'rectangle',
    color: '#ff0000',
    size: 4,
    rect: { x: 10, y: 10, width: 30, height: 20 },
  }
  const snapshot = createScreenshotEditSnapshot(100, 80, { x: 5, y: 4, width: 90, height: 70 })
  const withAnnotation = { ...snapshot, annotations: [annotation] }
  const moved = moveAnnotation(annotation, 90, -20, 100, 80) as RectangleAnnotation
  assert.deepEqual(moved.rect, { x: 70, y: 0, width: 30, height: 20 })

  const resized = resizeAnnotation(moved, 40, 90, 100, 80) as RectangleAnnotation
  assert.deepEqual(resized.rect, { x: 70, y: 0, width: 30, height: 80 })
  assert.deepEqual(annotationBounds(resized), resized.rect)

  const updated = updateAnnotation(withAnnotation, { ...annotation, color: '#00ff00' })
  assert.equal(updated.annotations[0].color, '#00ff00')
  assert.deepEqual(removeAnnotation(updated, annotation.id).annotations, [])
})

test('arrow raster rendering skips accidental taps and draws a filled head', () => {
  const operations: string[] = []
  const context = {
    clearRect() {},
    drawImage() {},
    beginPath() { operations.push('begin') },
    moveTo() { operations.push('move') },
    lineTo() { operations.push('line') },
    stroke() { operations.push('stroke') },
    closePath() { operations.push('close') },
    fill() { operations.push('fill') },
  } as unknown as CanvasRenderingContext2D
  const base: ArrowAnnotation = {
    id: 'arrow-1',
    type: 'arrow',
    color: '#ff0000',
    size: 4,
    x1: 10,
    y1: 10,
    x2: 12,
    y2: 11,
  }
  const snapshot = { crop: { x: 0, y: 0, width: 100, height: 80 }, annotations: [base] }

  drawScreenshotRasterPreview(context, {} as CanvasImageSource, 100, 80, snapshot)
  assert.deepEqual(operations, [])

  drawScreenshotRasterPreview(context, {} as CanvasImageSource, 100, 80, {
    ...snapshot,
    annotations: [{ ...base, x2: 80, y2: 50 }],
  })
  assert.deepEqual(operations, ['begin', 'move', 'line', 'stroke', 'begin', 'move', 'line', 'line', 'line', 'close', 'fill'])
})
