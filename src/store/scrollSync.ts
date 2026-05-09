import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'

// Transient cross-component coordination for split-mode scroll sync.
// CodeMirrorEditor publishes its EditorView; MarkdownPreview publishes its
// scrolling container; the useSplitScrollSync hook reads both and wires up
// the bidirectional listeners only when viewMode === 'split'.
interface ScrollSyncState {
  editorView: EditorView | null
  previewContainer: HTMLElement | null
  setEditorView: (view: EditorView | null) => void
  setPreviewContainer: (container: HTMLElement | null) => void
}

export const useScrollSyncStore = create<ScrollSyncState>((set) => ({
  editorView: null,
  previewContainer: null,
  setEditorView: (view) => set({ editorView: view }),
  setPreviewContainer: (container) => set({ previewContainer: container }),
}))
