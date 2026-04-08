import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOCUS_WIDTH_CUSTOM_MAX,
  FOCUS_WIDTH_CUSTOM_MIN,
  FOCUS_WIDTH_PRESET_VALUES,
  clampFocusWidthPx,
  resolveFocusInlinePaddingPx,
  resolveFocusWidthPx,
} from '../src/lib/focusWidth.ts'

test('resolveFocusWidthPx returns the expected preset widths', () => {
  assert.equal(resolveFocusWidthPx('narrow', 999), FOCUS_WIDTH_PRESET_VALUES.narrow)
  assert.equal(resolveFocusWidthPx('comfortable', 999), FOCUS_WIDTH_PRESET_VALUES.comfortable)
  assert.equal(resolveFocusWidthPx('wide', 999), FOCUS_WIDTH_PRESET_VALUES.wide)
})

test('resolveFocusWidthPx clamps custom widths into the supported range', () => {
  assert.equal(resolveFocusWidthPx('custom', FOCUS_WIDTH_CUSTOM_MIN - 200), FOCUS_WIDTH_CUSTOM_MIN)
  assert.equal(resolveFocusWidthPx('custom', FOCUS_WIDTH_CUSTOM_MAX + 200), FOCUS_WIDTH_CUSTOM_MAX)
  assert.equal(resolveFocusWidthPx('custom', 973), 980)
})

test('clampFocusWidthPx snaps values to the configured step size', () => {
  assert.equal(clampFocusWidthPx(961), 960)
  assert.equal(clampFocusWidthPx(969), 960)
  assert.equal(clampFocusWidthPx(971), 980)
})

test('resolveFocusInlinePaddingPx scales with width but stays within readable bounds', () => {
  assert.equal(resolveFocusInlinePaddingPx(840), 84)
  assert.equal(resolveFocusInlinePaddingPx(1280), 128)
  assert.equal(resolveFocusInlinePaddingPx(1600), 128)
})
