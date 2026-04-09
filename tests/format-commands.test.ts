import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState, EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { applyFormat } from '../src/components/Editor/formatCommands.ts'

function createTestView(doc: string, from: number, to = from): EditorView & { state: EditorState } {
  const view = {
    state: EditorState.create({
      doc,
      selection: EditorSelection.create([EditorSelection.range(from, to)]),
    }),
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      view.state = view.state.update(spec).state
    },
    focus() {},
  }

  return view as unknown as EditorView & { state: EditorState }
}

test('applyFormat wraps selected text with underline tags', () => {
  const view = createTestView('hello world', 0, 5)

  applyFormat(view, 'underline')

  assert.equal(view.state.doc.toString(), '<u>hello</u> world')
  assert.equal(view.state.selection.main.from, 3)
  assert.equal(view.state.selection.main.to, 8)
})

test('applyFormat removes underline tags when the full wrapped selection is selected', () => {
  const view = createTestView('<u>hello</u>', 0, 12)

  applyFormat(view, 'underline')

  assert.equal(view.state.doc.toString(), 'hello')
  assert.equal(view.state.selection.main.from, 0)
  assert.equal(view.state.selection.main.to, 5)
})

test('applyFormat wraps selected text with highlight markers', () => {
  const view = createTestView('hello world', 0, 5)

  applyFormat(view, 'highlight')

  assert.equal(view.state.doc.toString(), '==hello== world')
  assert.equal(view.state.selection.main.from, 2)
  assert.equal(view.state.selection.main.to, 7)
})

test('applyFormat removes highlight markers when the full wrapped selection is selected', () => {
  const view = createTestView('==hello==', 0, 9)

  applyFormat(view, 'highlight')

  assert.equal(view.state.doc.toString(), 'hello')
  assert.equal(view.state.selection.main.from, 0)
  assert.equal(view.state.selection.main.to, 5)
})
