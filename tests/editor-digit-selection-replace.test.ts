import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  replaceNonEmptySelectionWithText,
  selectionReplacingDigitKeymap,
} from '../src/components/Editor/extensions.ts'

function makeView(state: EditorState) {
  let dispatched: Record<string, unknown> | null = null
  return {
    view: {
      state,
      dispatch(spec: Record<string, unknown>) {
        dispatched = spec
      },
    },
    get dispatched() {
      return dispatched
    },
  }
}

test('replaceNonEmptySelectionWithText replaces the selection and advances the caret', () => {
  const state = EditorState.create({
    doc: 'abcXYZdef',
    selection: EditorSelection.range(3, 6),
  })
  const harness = makeView(state)

  assert.equal(replaceNonEmptySelectionWithText(harness.view, '1'), true)
  assert.ok(harness.dispatched)
  assert.equal(harness.dispatched.userEvent, 'input.type')

  const nextState = state.update(harness.dispatched).state
  assert.equal(nextState.doc.toString(), 'abc1def')
  assert.equal(nextState.selection.main.head, 4)
})

test('replaceNonEmptySelectionWithText is a no-op when the selection is empty', () => {
  const state = EditorState.create({
    doc: 'abc',
    selection: EditorSelection.cursor(1),
  })
  const harness = makeView(state)

  assert.equal(replaceNonEmptySelectionWithText(harness.view, '5'), false)
  assert.equal(harness.dispatched, null)
})

test('replaceNonEmptySelectionWithText is a no-op on read-only state', () => {
  const state = EditorState.create({
    doc: 'abc',
    selection: EditorSelection.range(0, 3),
    extensions: [EditorState.readOnly.of(true)],
  })
  const harness = makeView(state)

  assert.equal(replaceNonEmptySelectionWithText(harness.view, '7'), false)
  assert.equal(harness.dispatched, null)
})

test('replaceNonEmptySelectionWithText replaces every non-empty range', () => {
  const state = EditorState.create({
    doc: 'aa bb',
    selection: EditorSelection.create([
      EditorSelection.range(0, 2),
      EditorSelection.range(3, 5),
    ]),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  })
  const harness = makeView(state)

  assert.equal(replaceNonEmptySelectionWithText(harness.view, '9'), true)
  const nextState = state.update(harness.dispatched).state
  assert.equal(nextState.doc.toString(), '9 9')
})

test('selectionReplacingDigitKeymap binds every ASCII digit to the selection replacement', () => {
  const keys = selectionReplacingDigitKeymap.map((binding) => binding.key)
  assert.deepEqual(keys, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])

  // Each binding replaces a selection with its own digit and leaves an empty
  // selection untouched (so ordinary typing falls through to the native path).
  for (const binding of selectionReplacingDigitKeymap) {
    const digit = binding.key as string

    const selected = EditorState.create({
      doc: 'XY',
      selection: EditorSelection.range(0, 2),
    })
    const selectedHarness = makeView(selected)
    assert.equal(binding.run?.(selectedHarness.view as never), true)
    assert.equal(selected.update(selectedHarness.dispatched).state.doc.toString(), digit)

    const empty = EditorState.create({
      doc: 'XY',
      selection: EditorSelection.cursor(1),
    })
    const emptyHarness = makeView(empty)
    assert.equal(binding.run?.(emptyHarness.view as never), false)
    assert.equal(emptyHarness.dispatched, null)
  }
})

test('editor core extensions wire the digit selection-replacement keymap', async () => {
  const source = await readFile(new URL('../src/components/Editor/extensions.ts', import.meta.url), 'utf8')

  assert.match(source, /\.\.\.selectionReplacingDigitKeymap/)
})
