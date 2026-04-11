import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveEditorCursorBottomGapScrollTop } from '../src/lib/editorScroll.ts'

test('resolveEditorCursorBottomGapScrollTop keeps the cursor line three lines above the viewport bottom', () => {
  const nextScrollTop = resolveEditorCursorBottomGapScrollTop({
    currentScrollTop: 0,
    clientHeight: 600,
    scrollHeight: 1800,
    lineBottom: 580,
    bottomMargin: 84,
  })

  assert.equal(nextScrollTop, 64)
})

test('resolveEditorCursorBottomGapScrollTop does not scroll when the cursor already has enough room below it', () => {
  const nextScrollTop = resolveEditorCursorBottomGapScrollTop({
    currentScrollTop: 240,
    clientHeight: 600,
    scrollHeight: 1800,
    lineBottom: 700,
    bottomMargin: 84,
  })

  assert.equal(nextScrollTop, null)
})

test('resolveEditorCursorBottomGapScrollTop clamps to the available scroll range', () => {
  const nextScrollTop = resolveEditorCursorBottomGapScrollTop({
    currentScrollTop: 800,
    clientHeight: 600,
    scrollHeight: 1500,
    lineBottom: 1490,
    bottomMargin: 84,
  })

  assert.equal(nextScrollTop, 900)
})
