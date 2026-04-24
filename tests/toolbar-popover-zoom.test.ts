import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAnchoredOverlayStyle } from '../src/hooks/useAnchoredOverlayStyle.ts'

test('resolveAnchoredOverlayStyle keeps zoomed overlays aligned with zoomed triggers', () => {
  const style = resolveAnchoredOverlayStyle({
    anchorRect: {
      bottom: 120,
      left: 150,
      right: 270,
    },
    viewportHeight: 600,
    viewportWidth: 800,
    width: 200,
    zoom: 150,
  })

  assert.equal(style.position, 'fixed')
  assert.equal(style.left, 100)
  assert.equal(style.top, 90)
  assert.equal(style.width, 200)
  assert.equal(style.maxHeight, 298)
  assert.equal(style.zoom, '150%')
})

test('resolveAnchoredOverlayStyle clamps right-aligned zoomed overlays in logical viewport space', () => {
  const style = resolveAnchoredOverlayStyle({
    align: 'right',
    anchorRect: {
      bottom: 100,
      left: 700,
      right: 760,
    },
    viewportHeight: 600,
    viewportPadding: 12,
    viewportWidth: 800,
    width: 420,
    zoom: 200,
  })

  assert.equal(style.left, 12)
  assert.equal(style.top, 60)
  assert.equal(style.width, 376)
  assert.equal(style.maxHeight, 228)
  assert.equal(style.zoom, '200%')
})

test('resolveAnchoredOverlayStyle keeps overlays inside the editor boundary instead of the full viewport', () => {
  const style = resolveAnchoredOverlayStyle({
    align: 'right',
    anchorRect: {
      bottom: 150,
      left: 460,
      right: 500,
    },
    boundaryRect: {
      top: 60,
      left: 80,
      right: 500,
      bottom: 260,
    },
    viewportHeight: 800,
    viewportWidth: 1200,
    width: 420,
    zoom: 100,
  })

  assert.equal(style.left, 92)
  assert.equal(style.top, 160)
  assert.equal(style.width, 396)
  assert.equal(style.maxHeight, 78)
  assert.equal(style.zoom, '100%')
})
