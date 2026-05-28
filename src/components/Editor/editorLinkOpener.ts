// Ctrl/Cmd+Click on a link inside the editor opens the URL with the system
// default app (via the Tauri opener plugin), matching Typora and VS Code.
//
// Works in both Source and WYSIWYG modes: detection is done against the
// underlying Markdown source text (same in both modes), so a WYSIWYG-decorated
// link still resolves to its real URL.
//
// Hover affordance: when the primary modifier (Ctrl on Win/Linux, Cmd on macOS)
// is held while the pointer is over a link, the editor adds a class so the
// cursor becomes a pointer and the link colour can highlight via CSS.

import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { hasPrimaryModifier } from '../../lib/platform.ts'
import {
  findEditorLinkAtLinePosition,
  type DetectedEditorLink,
} from '../../lib/editorLinkAtPosition.ts'

const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const EDITOR_LINK_FOLLOWABLE_CLASS = 'cm-link-followable'

const lastPointerEventByView = new WeakMap<EditorView, MouseEvent>()

export function buildEditorLinkOpenerExtensions(): Extension[] {
  return [editorLinkOpenerDomHandlers]
}

const editorLinkOpenerDomHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    // Only primary button + primary modifier; never hijack right-click or drag.
    if (event.button !== 0) return false
    if (!hasPrimaryModifier(event)) return false

    const link = resolveLinkFromEvent(event, view)
    if (!link) return false

    event.preventDefault()
    event.stopPropagation()
    void openExternalEditorLink(link)
    return true
  },

  click(event, view) {
    // Some browsers still fire click after we consumed mousedown. Swallow it so
    // the cursor doesn't jump to the click position after we opened the link.
    if (!hasPrimaryModifier(event)) return false
    if (!resolveLinkFromEvent(event, view)) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  },

  mousemove(event, view) {
    lastPointerEventByView.set(view, event)
    setFollowableState(view, hasPrimaryModifier(event) && resolveLinkFromEvent(event, view) !== null)
    return false
  },

  mouseleave(_event, view) {
    setFollowableState(view, false)
    return false
  },

  keydown(event, view) {
    if (event.key !== 'Control' && event.key !== 'Meta') return false
    const last = lastPointerEventByView.get(view)
    if (!last) return false
    setFollowableState(view, hasPrimaryModifier(event) && resolveLinkFromEvent(last, view) !== null)
    return false
  },

  keyup(event, view) {
    if (event.key !== 'Control' && event.key !== 'Meta') return false
    setFollowableState(view, false)
    return false
  },
})

function setFollowableState(view: EditorView, on: boolean): void {
  view.dom.classList.toggle(EDITOR_LINK_FOLLOWABLE_CLASS, on)
}

function resolveLinkFromEvent(event: MouseEvent, view: EditorView): DetectedEditorLink | null {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
  if (pos === null) return null

  const line = view.state.doc.lineAt(pos)
  const detected = findEditorLinkAtLinePosition(line.text, pos - line.from)
  if (!detected) return null

  return {
    url: detected.url,
    label: detected.label,
    from: line.from + detected.from,
    to: line.from + detected.to,
  }
}

async function openExternalEditorLink(link: DetectedEditorLink): Promise<void> {
  try {
    if (isTauriEnv) {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(link.url)
      return
    }

    if (typeof window !== 'undefined') {
      window.open(link.url, '_blank', 'noopener,noreferrer')
    }
  } catch (error) {
    console.error('Open editor link error:', error)
    // Dynamic import keeps the i18n module out of the static dep graph for
    // tests that exercise editor extensions directly under Node's TS runner.
    try {
      const { pushErrorNotice } = await import('../../lib/notices.ts')
      pushErrorNotice('notices.openExternalErrorTitle', 'notices.openExternalErrorMessage', {
        values: { target: link.label },
      })
    } catch {
      // Notification surface unavailable (e.g. in tests); the console.error above is enough.
    }
  }
}
