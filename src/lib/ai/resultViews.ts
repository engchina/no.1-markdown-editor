import type { AIOutputTarget } from './types.ts'

export type AIResultView = 'draft' | 'diff'
export type AIInsertTarget =
  | 'replace-selection'
  | 'replace-current-block'
  | 'at-cursor'
  | 'insert-below'
  | 'new-note'

export function hasAIDiffPreview(
  outputTarget: AIOutputTarget,
  diffBaseText: string | null,
  draftText: string
): boolean {
  return (
    (outputTarget === 'replace-selection' || outputTarget === 'replace-current-block') &&
    diffBaseText !== null &&
    draftText.trim().length > 0
  )
}

export function hasAIInsertPreview(
  outputTarget: AIOutputTarget,
  draftText: string
): boolean {
  return outputTarget !== 'replace-selection' && outputTarget !== 'replace-current-block' && draftText.trim().length > 0
}

export function getAIInsertTargets(hasSelection: boolean, hasCurrentBlock = false): AIInsertTarget[] {
  const targets: AIInsertTarget[] = hasSelection
    ? ['replace-selection', 'at-cursor', 'insert-below']
    : hasCurrentBlock
      ? ['replace-current-block', 'at-cursor', 'insert-below']
      : ['at-cursor', 'insert-below']

  targets.push('new-note')

  return targets
}
