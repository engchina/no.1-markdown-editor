import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAIHistoryProviderAuditReport,
  buildAIHistoryProviderAuditReportFileName,
} from '../src/lib/ai/providerHistoryAuditReport.ts'

test('buildAIHistoryProviderAuditReport includes filters insights compare entries and error breakdown', () => {
  const report = buildAIHistoryProviderAuditReport({
    generatedAt: 1,
    statusFilter: 'error',
    budgetFilter: 'balanced',
    entries: [
      {
        id: 'entry-1',
        query: 'release owners',
        budget: 'balanced',
        collectionId: null,
        savedViewId: null,
        retrievalStatusFilter: 'all',
        retrievalPinnedOnly: false,
        candidateCount: 6,
        sentCount: 4,
        providerModel: 'mock-a',
        status: 'error',
        errorMessage: 'timeout',
        createdAt: 1,
      },
      {
        id: 'entry-2',
        query: 'release owners',
        budget: 'balanced',
        collectionId: null,
        savedViewId: null,
        retrievalStatusFilter: 'done',
        retrievalPinnedOnly: true,
        candidateCount: 4,
        sentCount: 3,
        providerModel: 'mock-a',
        status: 'success',
        errorMessage: null,
        createdAt: 2,
      },
    ],
    comparedEntries: [
      {
        id: 'entry-2',
        query: 'release owners',
        budget: 'balanced',
        collectionId: null,
        savedViewId: null,
        retrievalStatusFilter: 'done',
        retrievalPinnedOnly: true,
        candidateCount: 4,
        sentCount: 3,
        providerModel: 'mock-a',
        status: 'success',
        errorMessage: null,
        createdAt: 2,
      },
    ],
  })

  assert.equal(report.version, 1)
  assert.equal(report.generatedAt, 1)
  assert.deepEqual(report.filters, {
    status: 'error',
    budget: 'balanced',
  })
  assert.equal(report.insights.total, 2)
  assert.equal(report.insights.statusBreakdown.error, 1)
  assert.equal(report.insights.budgetBreakdown.balanced, 2)
  assert.deepEqual(report.insights.topErrorMessages, [{ message: 'timeout', count: 1 }])
  assert.equal(report.comparedEntries.length, 1)
  assert.equal(report.entries.length, 2)
})

test('buildAIHistoryProviderAuditReportFileName uses a stable audit-report prefix', () => {
  const fileName = buildAIHistoryProviderAuditReportFileName(new Date('2026-04-10T09:07:00Z'))

  assert.match(fileName, /^ai-history-audit-report-\d{8}-\d{4}\.json$/u)
})
