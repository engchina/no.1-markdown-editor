import type {
  AIApplySnapshot,
  AIComposerSource,
  AIIntent,
  AIOutputTarget,
  AIProvenanceKind,
  AIScope,
  AISelectedTextRole,
} from './types.ts'

export const EDITOR_AI_OPEN_EVENT = 'editor:ai-open'
export const EDITOR_AI_APPLY_EVENT = 'editor:ai-apply'
export const EDITOR_AI_GHOST_TEXT_EVENT = 'editor:ai-ghost-text'

export interface EditorAIOpenDetail {
  source: AIComposerSource
  intent?: AIIntent
  scope?: AIScope
  prompt?: string
  outputTarget?: AIOutputTarget
  selectedTextRole?: AISelectedTextRole
}

export interface EditorAIApplyDetail {
  tabId: string
  outputTarget: AIOutputTarget
  text: string
  snapshot: AIApplySnapshot
  provenance?: {
    badge: string
    detail: string
    kind: AIProvenanceKind
    createdAt: number
  }
}

export interface EditorAIGhostTextDetail {
  source: AIComposerSource
}

export function dispatchEditorAIOpen(detail: EditorAIOpenDetail): boolean {
  if (typeof document === 'undefined') return false
  return document.dispatchEvent(new CustomEvent<EditorAIOpenDetail>(EDITOR_AI_OPEN_EVENT, { detail, cancelable: true }))
}

export function dispatchEditorAIApply(detail: EditorAIApplyDetail): boolean {
  if (typeof document === 'undefined') return false
  document.dispatchEvent(new CustomEvent<EditorAIApplyDetail>(EDITOR_AI_APPLY_EVENT, { detail }))
  return true
}

export function dispatchEditorAIGhostText(detail: EditorAIGhostTextDetail): boolean {
  if (typeof document === 'undefined') return false
  document.dispatchEvent(new CustomEvent<EditorAIGhostTextDetail>(EDITOR_AI_GHOST_TEXT_EVENT, { detail }))
  return true
}
