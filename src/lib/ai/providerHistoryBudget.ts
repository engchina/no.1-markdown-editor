import type { AIHistoryProviderRerankBudget } from './types.ts'

export interface AIHistoryProviderRerankPolicy {
  maxCandidates: number
  includeResultPreview: boolean
  includeErrorMessage: boolean
  estimatedCost: 'low' | 'medium' | 'high'
}

export type AIHistoryProviderRerankFieldSet =
  | 'promptsOnly'
  | 'promptsAndResults'
  | 'promptsResultsErrors'

export function resolveAIHistoryProviderRerankPolicy(
  budget: AIHistoryProviderRerankBudget
): AIHistoryProviderRerankPolicy {
  switch (budget) {
    case 'conservative':
      return {
        maxCandidates: 3,
        includeResultPreview: false,
        includeErrorMessage: false,
        estimatedCost: 'low',
      }
    case 'deep':
      return {
        maxCandidates: 10,
        includeResultPreview: true,
        includeErrorMessage: true,
        estimatedCost: 'high',
      }
    case 'balanced':
    default:
      return {
        maxCandidates: 6,
        includeResultPreview: true,
        includeErrorMessage: false,
        estimatedCost: 'medium',
      }
  }
}

export function estimateAIHistoryProviderRerankSendCount(
  visibleCandidateCount: number,
  budget: AIHistoryProviderRerankBudget
) {
  return Math.min(visibleCandidateCount, resolveAIHistoryProviderRerankPolicy(budget).maxCandidates)
}

export function getAIHistoryProviderRerankFieldSet(
  policy: AIHistoryProviderRerankPolicy
): AIHistoryProviderRerankFieldSet {
  if (policy.includeErrorMessage) return 'promptsResultsErrors'
  if (policy.includeResultPreview) return 'promptsAndResults'
  return 'promptsOnly'
}
