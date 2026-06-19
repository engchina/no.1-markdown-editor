import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { EditorSelection, EditorState } from '@codemirror/state'
import { insertHalfWidthSpace } from '../src/components/Editor/extensions.ts'

test('insertHalfWidthSpace inserts an ASCII space and advances the caret past it', () => {
  const state = EditorState.create({
    doc: '日本語',
    selection: EditorSelection.cursor(3),
  })

  let dispatched: Record<string, unknown> | null = null
  const view = {
    state,
    dispatch(spec: Record<string, unknown>) {
      dispatched = spec
    },
  }

  assert.equal(insertHalfWidthSpace(view), true)
  assert.ok(dispatched)
  assert.equal(dispatched.userEvent, 'input.type')

  const nextState = state.update(dispatched).state
  assert.equal(nextState.doc.toString(), '日本語 ')
  assert.equal(nextState.doc.sliceString(3, 4), ' ')
  assert.equal(nextState.selection.main.head, 4)
})

test('insertHalfWidthSpace replaces a non-empty selection with a single space', () => {
  const state = EditorState.create({
    doc: 'abcXYZdef',
    selection: EditorSelection.range(3, 6),
  })

  let dispatched: Record<string, unknown> | null = null
  const view = {
    state,
    dispatch(spec: Record<string, unknown>) {
      dispatched = spec
    },
  }

  assert.equal(insertHalfWidthSpace(view), true)
  assert.ok(dispatched)

  const nextState = state.update(dispatched).state
  assert.equal(nextState.doc.toString(), 'abc def')
  assert.equal(nextState.selection.main.head, 4)
})

test('insertHalfWidthSpace inserts at every cursor for multi-selection', () => {
  const state = EditorState.create({
    doc: 'ab\ncd',
    selection: EditorSelection.create([
      EditorSelection.cursor(2),
      EditorSelection.cursor(5),
    ]),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  })

  let dispatched: Record<string, unknown> | null = null
  const view = {
    state,
    dispatch(spec: Record<string, unknown>) {
      dispatched = spec
    },
  }

  assert.equal(insertHalfWidthSpace(view), true)
  assert.ok(dispatched)

  const nextState = state.update(dispatched).state
  assert.equal(nextState.doc.toString(), 'ab \ncd ')
})

test('insertHalfWidthSpace is a no-op on read-only state', () => {
  const state = EditorState.create({
    doc: 'abc',
    selection: EditorSelection.cursor(3),
    extensions: [EditorState.readOnly.of(true)],
  })

  let dispatched = false
  const view = {
    state,
    dispatch() {
      dispatched = true
    },
  }

  assert.equal(insertHalfWidthSpace(view), false)
  assert.equal(dispatched, false)
})

test('editor core extensions wire Shift+Space to the half-width space command', async () => {
  const source = await readFile(new URL('../src/components/Editor/extensions.ts', import.meta.url), 'utf8')

  assert.match(source, /key:\s*'Shift-Space'/)
  assert.match(source, /run:\s*insertHalfWidthSpace/)
})
