import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAIHistoryProviderAuditInsights } from '../src/lib/ai/providerHistoryAuditAnalysis.ts'

test('buildAIHistoryProviderAuditInsights summarizes success rate budget and repeated queries', () => {
  const insights = buildAIHistoryProviderAuditInsights([
    {
      id: 'audit-1',
      query: 'release owners',
      budget: 'balanced',
      collectionId: null,
      savedViewId: null,
      retrievalStatusFilter: 'all',
      retrievalPinnedOnly: false,
      candidateCount: 6,
      sentCount: 4,
      providerModel: 'mock-a',
      status: 'success',
      errorMessage: null,
      createdAt: 1,
    },
    {
      id: 'audit-2',
      query: 'release owners',
      budget: 'balanced',
      collectionId: null,
      savedViewId: null,
      retrievalStatusFilter: 'done',
      retrievalPinnedOnly: true,
      candidateCount: 4,
      sentCount: 3,
      providerModel: 'mock-a',
      status: 'error',
      errorMessage: 'timeout',
      createdAt: 2,
    },
    {
      id: 'audit-3',
      query: 'retro followups',
      budget: 'deep',
      collectionId: null,
      savedViewId: null,
      retrievalStatusFilter: 'error',
      retrievalPinnedOnly: false,
      candidateCount: 10,
      sentCount: 6,
      providerModel: 'mock-b',
      status: 'success',
      errorMessage: null,
      createdAt: 3,
    },
  ])

  assert.equal(insights.total, 3)
  assert.equal(insights.successCount, 2)
  assert.equal(insights.errorCount, 1)
  assert.equal(insights.successRatePercent, 67)
  assert.equal(insights.averageSentCount, 4)
  assert.equal(insights.averageVisibleCount, 7)
  assert.equal(insights.averageSendRatioPercent, 67)
  assert.equal(insights.topBudget, 'balanced')
  assert.equal(insights.topProviderModel, 'mock-a')
  assert.deepEqual(insights.repeatedQueries, [{ query: 'release owners', count: 2 }])
})

test('buildAIHistoryProviderAuditInsights returns empty defaults when no entries exist', () => {
  const insights = buildAIHistoryProviderAuditInsights([])

  assert.deepEqual(insights, {
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
  })
})
