import type { AIOutputTarget } from './types.ts'

export type AIResultView = 'draft' | 'diff' | 'explain'
export type AIInsertTarget =
  | 'replace-selection'
  | 'at-cursor'
  | 'insert-below'
  | 'insert-under-heading'
  | 'new-note'

export function hasAIDiffPreview(
  outputTarget: AIOutputTarget,
  diffBaseText: string | null,
  draftText: string
): boolean {
  return outputTarget === 'replace-selection' && diffBaseText !== null && draftText.trim().length > 0
}

export function hasAIInsertPreview(
  outputTarget: AIOutputTarget,
  draftText: string
): boolean {
  return outputTarget !== 'replace-selection' && draftText.trim().length > 0
}

export function getAIInsertTargets(hasSelection: boolean, hasHeading: boolean): AIInsertTarget[] {
  const targets: AIInsertTarget[] = hasSelection
    ? ['replace-selection', 'at-cursor', 'insert-below']
    : ['at-cursor', 'insert-below']

  if (hasHeading) {
    targets.push('insert-under-heading')
  }

  targets.push('new-note')

  return targets
}
