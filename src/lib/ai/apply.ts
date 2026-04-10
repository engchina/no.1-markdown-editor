import type { AIApplySnapshot, AIOutputTarget } from './types.ts'

export interface AIResolvedApplyChange {
  range: { from: number; to: number }
  text: string
}

export function isAIApplySnapshotStale(snapshot: AIApplySnapshot, currentDoc: string): boolean {
  return snapshot.docText !== currentDoc
}

export function resolveAIApplyChange(
  outputTarget: AIOutputTarget,
  snapshot: AIApplySnapshot,
  currentDoc: string,
  text: string
): AIResolvedApplyChange {
  if (outputTarget === 'new-note') {
    throw new Error('New note output must be handled outside the current document apply flow.')
  }

  if (outputTarget === 'replace-selection') {
    return {
      range: { from: snapshot.selectionFrom, to: snapshot.selectionTo },
      text,
    }
  }

  if (outputTarget === 'insert-below') {
    return {
      range: { from: snapshot.blockTo, to: snapshot.blockTo },
      text: formatInsertBelowText(currentDoc, snapshot.blockTo, text),
    }
  }

  if (outputTarget === 'insert-under-heading') {
    const insertionPoint = snapshot.headingTo ?? snapshot.blockTo
    return {
      range: { from: insertionPoint, to: insertionPoint },
      text: formatInsertBelowText(currentDoc, insertionPoint, text),
    }
  }

  return {
    range: { from: snapshot.anchorOffset, to: snapshot.anchorOffset },
    text,
  }
}

export function formatInsertBelowText(currentDoc: string, blockTo: number, text: string): string {
  const normalized = text.trim()
  if (!normalized) return ''

  const before = currentDoc.slice(0, blockTo)
  const after = currentDoc.slice(blockTo)
  const beforeHasBlankGap = /(?:\r?\n){2}$/u.test(before) || before.length === 0
  const beforeEndsWithNewline = /\r?\n$/u.test(before)
  const afterHasBlankGap = /^(?:\r?\n){2}/u.test(after) || after.length === 0
  const afterStartsWithNewline = /^\r?\n/u.test(after)

  const prefix = beforeHasBlankGap ? '' : beforeEndsWithNewline ? '\n' : '\n\n'
  const suffix = afterHasBlankGap ? '' : afterStartsWithNewline ? '\n' : '\n\n'

  return `${prefix}${normalized}${suffix}`
}
