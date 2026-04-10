import { buildAIHistoryProviderAuditInsights } from './providerHistoryAuditAnalysis.ts'
import type {
  AIHistoryProviderRerankAuditEntry,
  AIHistoryProviderRerankBudget,
} from './types.ts'

export interface AIHistoryProviderAuditReport {
  version: 1
  generatedAt: number
  filters: {
    status: 'all' | 'success' | 'error'
    budget: 'all' | AIHistoryProviderRerankBudget
  }
  insights: ReturnType<typeof buildAIHistoryProviderAuditInsights> & {
    budgetBreakdown: Record<AIHistoryProviderRerankBudget, number>
    statusBreakdown: {
      success: number
      error: number
    }
    topErrorMessages: Array<{
      message: string
      count: number
    }>
  }
  comparedEntries: AIHistoryProviderRerankAuditEntry[]
  entries: AIHistoryProviderRerankAuditEntry[]
}

export function buildAIHistoryProviderAuditReport(args: {
  entries: readonly AIHistoryProviderRerankAuditEntry[]
  comparedEntries?: readonly AIHistoryProviderRerankAuditEntry[]
  statusFilter: 'all' | 'success' | 'error'
  budgetFilter: 'all' | AIHistoryProviderRerankBudget
  generatedAt?: number
}): AIHistoryProviderAuditReport {
  const entries = [...args.entries]
  const comparedEntries = [...(args.comparedEntries ?? [])]
  const insights = buildAIHistoryProviderAuditInsights(entries)
  const topErrorMessages = resolveTopErrorMessages(entries)

  return {
    version: 1,
    generatedAt: args.generatedAt ?? Date.now(),
    filters: {
      status: args.statusFilter,
      budget: args.budgetFilter,
    },
    insights: {
      ...insights,
      budgetBreakdown: {
        conservative: entries.filter((entry) => entry.budget === 'conservative').length,
        balanced: entries.filter((entry) => entry.budget === 'balanced').length,
        deep: entries.filter((entry) => entry.budget === 'deep').length,
      },
      statusBreakdown: {
        success: entries.filter((entry) => entry.status === 'success').length,
        error: entries.filter((entry) => entry.status === 'error').length,
      },
      topErrorMessages,
    },
    comparedEntries,
    entries,
  }
}

export function buildAIHistoryProviderAuditReportFileName(date = new Date()) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `ai-history-audit-report-${year}${month}${day}-${hour}${minute}.json`
}

function resolveTopErrorMessages(entries: readonly AIHistoryProviderRerankAuditEntry[]) {
  const counts = new Map<string, { message: string; count: number }>()

  for (const entry of entries) {
    const message = entry.errorMessage?.trim()
    if (!message) continue

    const key = message.toLowerCase()
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(key, {
        message,
        count: 1,
      })
    }
  }

  return Array.from(counts.values())
    .sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count
      return left.message.localeCompare(right.message)
    })
    .slice(0, 5)
}
