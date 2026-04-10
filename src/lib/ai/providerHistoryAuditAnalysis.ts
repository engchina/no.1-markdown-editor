import type {
  AIHistoryProviderRerankAuditEntry,
  AIHistoryProviderRerankBudget,
} from './types.ts'

export interface AIHistoryProviderAuditInsights {
  total: number
  successCount: number
  errorCount: number
  successRatePercent: number
  averageSentCount: number
  averageVisibleCount: number
  averageSendRatioPercent: number
  topBudget: AIHistoryProviderRerankBudget | null
  topProviderModel: string | null
  repeatedQueries: Array<{
    query: string
    count: number
  }>
}

export function buildAIHistoryProviderAuditInsights(
  entries: readonly AIHistoryProviderRerankAuditEntry[]
): AIHistoryProviderAuditInsights {
  const total = entries.length
  if (total === 0) {
    return {
      total: 0,
      successCount: 0,
      errorCount: 0,
      successRatePercent: 0,
      averageSentCount: 0,
      averageVisibleCount: 0,
      averageSendRatioPercent: 0,
      topBudget: null,
      topProviderModel: null,
      repeatedQueries: [],
    }
  }

  const successCount = entries.filter((entry) => entry.status === 'success').length
  const errorCount = total - successCount
  const totalSent = entries.reduce((sum, entry) => sum + entry.sentCount, 0)
  const totalVisible = entries.reduce((sum, entry) => sum + entry.candidateCount, 0)
  const totalRatio = entries.reduce((sum, entry) => {
    if (entry.candidateCount <= 0) return sum
    return sum + entry.sentCount / entry.candidateCount
  }, 0)

  const budgetCounts = new Map<AIHistoryProviderRerankBudget, number>()
  const providerCounts = new Map<string, number>()
  const queryCounts = new Map<string, { query: string; count: number }>()

  for (const entry of entries) {
    budgetCounts.set(entry.budget, (budgetCounts.get(entry.budget) ?? 0) + 1)

    if (entry.providerModel) {
      providerCounts.set(entry.providerModel, (providerCounts.get(entry.providerModel) ?? 0) + 1)
    }

    const queryKey = entry.query.trim().toLowerCase()
    const existingQuery = queryCounts.get(queryKey)
    if (existingQuery) {
      existingQuery.count += 1
    } else if (queryKey) {
      queryCounts.set(queryKey, {
        query: entry.query.trim(),
        count: 1,
      })
    }
  }

  return {
    total,
    successCount,
    errorCount,
    successRatePercent: Math.round((successCount / total) * 100),
    averageSentCount: Math.round(totalSent / total),
    averageVisibleCount: Math.round(totalVisible / total),
    averageSendRatioPercent: Math.round((totalRatio / total) * 100),
    topBudget: resolveMostCommonBudget(budgetCounts),
    topProviderModel: resolveMostCommonProvider(providerCounts),
    repeatedQueries: Array.from(queryCounts.values())
      .filter((item) => item.count > 1)
      .sort((left, right) => {
        if (left.count !== right.count) return right.count - left.count
        return left.query.localeCompare(right.query)
      })
      .slice(0, 3),
  }
}

function resolveMostCommonBudget(counts: Map<AIHistoryProviderRerankBudget, number>) {
  let selected: AIHistoryProviderRerankBudget | null = null
  let selectedCount = -1

  for (const [budget, count] of counts.entries()) {
    if (count > selectedCount) {
      selected = budget
      selectedCount = count
    }
  }

  return selected
}

function resolveMostCommonProvider(counts: Map<string, number>) {
  let selected: string | null = null
  let selectedCount = -1

  for (const [provider, count] of counts.entries()) {
    if (count > selectedCount) {
      selected = provider
      selectedCount = count
    }
  }

  return selected
}
