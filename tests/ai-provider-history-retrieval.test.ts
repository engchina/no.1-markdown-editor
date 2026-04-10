import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAIHistoryProviderRerankPrompt,
  parseAIHistoryProviderRerankResponse,
} from '../src/lib/ai/providerHistoryRetrieval.ts'

test('buildAIHistoryProviderRerankPrompt includes the marker, instructions, and candidate payload', () => {
  const prompt = buildAIHistoryProviderRerankPrompt({
    query: 'translate release summary into Japanese',
    budget: 'balanced',
    candidates: [
      {
        id: 'entry-1',
        documentKey: 'path:notes/release.md',
        threadId: 'thread-1',
        pinned: false,
        source: 'shortcut',
        intent: 'edit',
        scope: 'selection',
        outputTarget: 'replace-selection',
        prompt: 'Translate the release summary into Japanese.',
        resultPreview: 'Japanese release summary.',
        errorMessage: null,
        status: 'done',
        documentName: 'release.md',
        attachmentCount: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  })

  assert.match(prompt, /\[ai-history-ranking\]/)
  assert.match(prompt, /Return JSON only\./)
  assert.match(prompt, /"id": "entry-1"/)
  assert.match(prompt, /"query": "translate release summary into Japanese"/)
  assert.match(prompt, /"budget": "balanced"/)
  assert.match(prompt, /"resultPreview": "Japanese release summary\."/)
})

test('buildAIHistoryProviderRerankPrompt respects conservative privacy budget by omitting result previews', () => {
  const prompt = buildAIHistoryProviderRerankPrompt({
    query: 'translate release summary into Japanese',
    budget: 'conservative',
    candidates: [
      {
        id: 'entry-1',
        documentKey: 'path:notes/release.md',
        threadId: 'thread-1',
        pinned: false,
        source: 'shortcut',
        intent: 'edit',
        scope: 'selection',
        outputTarget: 'replace-selection',
        prompt: 'Translate the release summary into Japanese.',
        resultPreview: 'Japanese release summary.',
        errorMessage: null,
        status: 'done',
        documentName: 'release.md',
        attachmentCount: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  })

  assert.match(prompt, /"budget": "conservative"/)
  assert.doesNotMatch(prompt, /resultPreview/u)
})

test('buildAIHistoryProviderRerankPrompt includes error fields for deep budget review', () => {
  const prompt = buildAIHistoryProviderRerankPrompt({
    query: 'review failed translation attempts',
    budget: 'deep',
    candidates: [
      {
        id: 'entry-1',
        documentKey: 'path:notes/release.md',
        threadId: 'thread-1',
        pinned: true,
        source: 'shortcut',
        intent: 'review',
        scope: 'selection',
        outputTarget: 'chat-only',
        prompt: 'Review the failed translation attempt.',
        resultPreview: 'Partial translation draft.',
        errorMessage: 'Timeout from provider.',
        status: 'error',
        documentName: 'release.md',
        attachmentCount: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  })

  assert.match(prompt, /"budget": "deep"/)
  assert.match(prompt, /"resultPreview": "Partial translation draft\."/)
  assert.match(prompt, /"errorMessage": "Timeout from provider\."/)
})

test('parseAIHistoryProviderRerankResponse reads raw JSON and fenced JSON payloads', () => {
  const direct = parseAIHistoryProviderRerankResponse(
    '{"results":[{"id":"entry-1","score":91,"rationale":"Strong semantic overlap."}]}'
  )
  assert.equal(direct.results[0]?.id, 'entry-1')
  assert.equal(direct.results[0]?.score, 91)

  const fenced = parseAIHistoryProviderRerankResponse(
    '```json\n{"results":[{"id":"entry-2","score":77.6,"rationale":"Relevant prior translation run."}]}\n```'
  )
  assert.equal(fenced.results[0]?.id, 'entry-2')
  assert.equal(fenced.results[0]?.score, 78)
})
