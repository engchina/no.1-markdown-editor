import { isolateHistory } from '@codemirror/commands'
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
} from '@codemirror/view'
import {
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
} from '@codemirror/state'
import { createAIProvenanceAddEffect, createAIProvenanceMark } from './provenance.ts'
import { appendEditorSelectionScrollEffect } from '../editorScroll.ts'

export interface AIGhostTextState {
  anchor: number
  status: 'loading' | 'ready'
  text: string
  badge: string
  detail: string
  createdAt: number
}

const setAIGhostTextEffect = StateEffect.define<AIGhostTextState | null>()
const clearAIGhostTextEffect = StateEffect.define<void>()

const aiGhostTextField = StateField.define<AIGhostTextState | null>({
  create() {
    return null
  },
  update(value, transaction) {
    let nextValue = value

    for (const effect of transaction.effects) {
      if (effect.is(setAIGhostTextEffect)) {
        nextValue = effect.value
      }

      if (effect.is(clearAIGhostTextEffect)) {
        nextValue = null
      }
    }

    if (!nextValue) return null
    if (transaction.docChanged) return null

    const selection = transaction.state.selection.main
    if (!selection.empty || selection.head !== nextValue.anchor) {
      return null
    }

    if (nextValue.anchor > transaction.state.doc.length) {
      return null
    }

    return nextValue
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value): DecorationSet => {
      if (!value) return Decoration.none

      return Decoration.set([
        Decoration.widget({
          widget: new AIGhostTextWidget(value),
          side: 1,
        }).range(value.anchor),
      ])
    }),
})

export function createAIGhostTextExtensions(): Extension[] {
  return [
    aiGhostTextField,
    Prec.high(
      keymap.of([
        {
          key: 'Tab',
          run: (view) => acceptAIGhostText(view),
        },
        {
          key: 'Escape',
          run: (view) => {
            if (!readAIGhostText(view)) return false
            clearAIGhostText(view)
            return true
          },
        },
      ])
    ),
  ]
}

export function showAIGhostText(view: EditorView, value: AIGhostTextState | null): void {
  view.dispatch({
    effects: setAIGhostTextEffect.of(value),
  })
}

export function clearAIGhostText(view: EditorView): void {
  view.dispatch({
    effects: clearAIGhostTextEffect.of(),
  })
}

export function readAIGhostText(view: EditorView): AIGhostTextState | null {
  return view.state.field(aiGhostTextField, false) ?? null
}

export function acceptAIGhostText(view: EditorView): boolean {
  const ghostText = readAIGhostText(view)
  if (!ghostText || ghostText.status !== 'ready' || !ghostText.text) return false

  const provenanceFrom = ghostText.anchor
  const provenanceTo = ghostText.anchor + ghostText.text.length
  const selectionAnchor = ghostText.anchor + ghostText.text.length
  view.dispatch({
    changes: {
      from: ghostText.anchor,
      to: ghostText.anchor,
      insert: ghostText.text,
    },
    selection: {
      anchor: selectionAnchor,
    },
    annotations: isolateHistory.of('full'),
    effects: appendEditorSelectionScrollEffect(view, [
      clearAIGhostTextEffect.of(),
      createAIProvenanceAddEffect(
        createAIProvenanceMark({
          from: provenanceFrom,
          to: provenanceTo,
          badge: ghostText.badge,
          detail: ghostText.detail,
          kind: 'ghost-text',
          createdAt: ghostText.createdAt,
        })
      ),
    ], selectionAnchor),
    userEvent: 'input.ai',
  })

  return true
}

class AIGhostTextWidget extends WidgetType {
  constructor(private readonly value: AIGhostTextState) {
    super()
  }

  override eq(other: AIGhostTextWidget): boolean {
    return (
      other.value.anchor === this.value.anchor &&
      other.value.status === this.value.status &&
      other.value.text === this.value.text
    )
  }

  override toDOM(): HTMLElement {
    const element = document.createElement('span')
    element.className = 'cm-ai-ghost-text'
    element.dataset.aiGhostText = this.value.status
    element.setAttribute('aria-hidden', 'true')
    element.textContent = this.value.text || '...'
    return element
  }

  override ignoreEvent(): boolean {
    return true
  }
}

export function shouldKeepAIGhostText(
  view: EditorView,
  snapshotDocText: string,
  anchor: number
): boolean {
  const selection = view.state.selection.main
  return (
    view.state.doc.toString() === snapshotDocText &&
    selection.empty &&
    selection.head === anchor
  )
}

export function createAIGhostTextSnapshot(view: EditorView): {
  anchor: number
  docText: string
} {
  return {
    anchor: view.state.selection.main.head,
    docText: view.state.doc.toString(),
  }
}

export function hasVisibleAIGhostText(state: EditorState): boolean {
  return state.field(aiGhostTextField, false) !== undefined && state.field(aiGhostTextField, false) !== null
}
