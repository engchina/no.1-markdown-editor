import assert from 'node:assert/strict'
import test from 'node:test'
import type { EditorView } from '@codemirror/view'
import { createEditorSelectionScrollEffect, resolveEditorCursorBottomGapScrollTop } from '../src/lib/editorScroll.ts'

test('createEditorSelectionScrollEffect uses nearest alignment so visible cursors stay put after paste', () => {
  const effect = createEditorSelectionScrollEffect({
    defaultLineHeight: 28,
  } as EditorView, 17)
  const target = effect.value as {
    range: {
      from: number
      to: number
    }
    y: string
    yMargin: number
  }

  assert.equal(target.range.from, 17)
  assert.equal(target.range.to, 17)
  assert.equal(target.y, 'nearest')
  assert.equal(target.yMargin, 84)
})

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
