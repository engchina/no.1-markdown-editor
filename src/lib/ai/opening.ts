import type { AIIntent, AIOutputTarget, AISelectedTextRole } from './types.ts'

export type AIDefaultWriteTarget = 'replace-selection' | 'at-cursor' | 'insert-below'

export function resolveAIOpenOutputTarget(
  intent: AIIntent,
  requestedOutputTarget: AIOutputTarget | undefined,
  hasSelection: boolean,
  defaultWriteTarget: AIDefaultWriteTarget
): AIOutputTarget {
  if (requestedOutputTarget) {
    if (requestedOutputTarget === 'replace-selection' && !hasSelection) {
      return intent === 'ask' || intent === 'review' ? 'chat-only' : defaultWriteTarget === 'replace-selection' ? 'at-cursor' : defaultWriteTarget
    }
    return requestedOutputTarget
  }

  switch (intent) {
    case 'ask':
    case 'review':
      return 'chat-only'
    case 'edit':
      if (hasSelection) {
        return defaultWriteTarget === 'replace-selection' ? 'replace-selection' : defaultWriteTarget
      }
      return defaultWriteTarget === 'replace-selection' ? 'at-cursor' : defaultWriteTarget
    case 'generate':
    default:
      return defaultWriteTarget === 'replace-selection' ? 'at-cursor' : defaultWriteTarget
  }
}

export function resolveAISelectedTextRole(
  requestedRole: AISelectedTextRole | undefined,
  defaultRole: AISelectedTextRole
): AISelectedTextRole {
  return requestedRole ?? defaultRole
}
