import type {
  AIHistoryCollectionRetrievalPolicy,
  AIHistoryProviderRerankBudget,
} from './types.ts'

export const DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY = Object.freeze({
  providerMode: 'inherit',
  providerBudgetOverride: null,
}) satisfies AIHistoryCollectionRetrievalPolicy

export function createDefaultAIHistoryCollectionRetrievalPolicy(): AIHistoryCollectionRetrievalPolicy {
  return {
    providerMode: DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY.providerMode,
    providerBudgetOverride: DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY.providerBudgetOverride,
  }
}

export function resolveAIHistoryCollectionProviderRerankEnabled(
  globalEnabled: boolean,
  policy: AIHistoryCollectionRetrievalPolicy | null | undefined
) {
  switch (policy?.providerMode) {
    case 'local-only':
      return false
    case 'allow-provider':
      return true
    case 'inherit':
    default:
      return globalEnabled
  }
}

export function resolveAIHistoryCollectionProviderRerankBudget(
  globalBudget: AIHistoryProviderRerankBudget,
  policy: AIHistoryCollectionRetrievalPolicy | null | undefined
) {
  return policy?.providerBudgetOverride ?? globalBudget
}

export function isAIHistoryCollectionRetrievalPolicyCustomized(
  policy: AIHistoryCollectionRetrievalPolicy | null | undefined
) {
  if (!policy) return false

  return (
    policy.providerMode !== DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY.providerMode ||
    policy.providerBudgetOverride !== DEFAULT_AI_HISTORY_COLLECTION_RETRIEVAL_POLICY.providerBudgetOverride
  )
}
