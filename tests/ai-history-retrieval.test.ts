import assert from 'node:assert/strict'
import test from 'node:test'
import {
  rankAIHistoryCandidates,
  retrieveAIHistoryCandidates,
  sortHistoryCandidates,
  tokenizeHistoryQuery,
} from '../src/lib/ai/historyRetrieval.ts'

const NOW = Date.now()

test('tokenizeHistoryQuery removes duplicates and low-signal stop words', () => {
  assert.deepEqual(
    tokenizeHistoryQuery('Summarize the release checklist and release owners'),
    ['summarize', 'release', 'checklist', 'owner']
  )
})

test('rankAIHistoryCandidates prefers semantically related prompt and result matches', () => {
  const ranked = rankAIHistoryCandidates([
    {
      id: 'a',
      documentKey: 'path:notes/release.md',
      threadId: 'thread-a',
      pinned: false,
      source: 'shortcut',
      intent: 'review',
      scope: 'current-block',
      outputTarget: 'chat-only',
      prompt: 'Review the release checklist and confirm owners',
      resultPreview: 'Release checklist review with concrete owner follow-ups.',
      errorMessage: null,
      status: 'done',
      documentName: 'release.md',
      attachmentCount: 1,
      createdAt: NOW - 2_000,
      updatedAt: NOW - 1_000,
    },
    {
      id: 'b',
      documentKey: 'path:notes/roadmap.md',
      threadId: 'thread-b',
      pinned: false,
      source: 'shortcut',
      intent: 'ask',
      scope: 'current-block',
      outputTarget: 'chat-only',
      prompt: 'Summarize the product roadmap',
      resultPreview: 'Roadmap summary.',
      errorMessage: null,
      status: 'done',
      documentName: 'roadmap.md',
      attachmentCount: 0,
      createdAt: NOW - 4_000,
      updatedAt: NOW - 3_000,
    },
  ], 'release owners checklist')

  assert.equal(ranked[0]?.id, 'a')
})

test('retrieveAIHistoryCandidates matches multilingual semantic concepts across prompt history', () => {
  const matches = retrieveAIHistoryCandidates([
    {
      id: 'translate-jp',
      documentKey: 'path:notes/jp.md',
      threadId: 'thread-jp',
      pinned: false,
      source: 'shortcut',
      intent: 'edit',
      scope: 'selection',
      outputTarget: 'replace-selection',
      prompt: 'Translate selected text into Japanese while preserving Markdown structure.',
      resultPreview: 'Japanese translation.',
      errorMessage: null,
      status: 'done',
      documentName: 'jp.md',
      attachmentCount: 0,
      createdAt: NOW - 3_000,
      updatedAt: NOW - 2_000,
    },
    {
      id: 'roadmap',
      documentKey: 'path:notes/roadmap.md',
      threadId: 'thread-roadmap',
      pinned: false,
      source: 'shortcut',
      intent: 'ask',
      scope: 'current-block',
      outputTarget: 'chat-only',
      prompt: 'Summarize the roadmap milestones.',
      resultPreview: 'Roadmap summary.',
      errorMessage: null,
      status: 'done',
      documentName: 'roadmap.md',
      attachmentCount: 0,
      createdAt: NOW - 2_000,
      updatedAt: NOW - 1_000,
    },
  ], '翻译日文')

  assert.equal(matches[0]?.candidate.id, 'translate-jp')
  assert.equal(matches[0]?.matchKind, 'semantic')
})

test('retrieveAIHistoryCandidates uses fuzzy retrieval for close wording when exact tokens diverge', () => {
  const matches = retrieveAIHistoryCandidates([
    {
      id: 'checklist',
      documentKey: 'path:notes/release-checklist.md',
      threadId: 'thread-checklist',
      pinned: false,
      source: 'shortcut',
      intent: 'review',
      scope: 'document',
      outputTarget: 'chat-only',
      prompt: 'Review the release checklist and verify owners.',
      resultPreview: 'Checklist review with owner verification.',
      errorMessage: null,
      status: 'done',
      documentName: 'release-checklist.md',
      attachmentCount: 0,
      createdAt: NOW - 4_000,
      updatedAt: NOW - 3_000,
    },
    {
      id: 'unrelated',
      documentKey: 'path:notes/design.md',
      threadId: 'thread-design',
      pinned: false,
      source: 'shortcut',
      intent: 'ask',
      scope: 'current-block',
      outputTarget: 'chat-only',
      prompt: 'Document the color system.',
      resultPreview: 'Color guidance.',
      errorMessage: null,
      status: 'done',
      documentName: 'design.md',
      attachmentCount: 0,
      createdAt: NOW - 2_000,
      updatedAt: NOW - 1_000,
    },
  ], 'release cheklist')

  assert.equal(matches[0]?.candidate.id, 'checklist')
  assert.ok(['lexical', 'fuzzy', 'semantic'].includes(matches[0]?.matchKind ?? ''))
})

test('sortHistoryCandidates keeps pinned entries ahead of newer unpinned entries', () => {
  const sorted = sortHistoryCandidates([
    {
      id: 'newer',
      documentKey: 'path:notes/newer.md',
      threadId: 'thread-newer',
      pinned: false,
      source: 'shortcut',
      intent: 'ask',
      scope: 'current-block',
      outputTarget: 'chat-only',
      prompt: 'Newer prompt',
      resultPreview: null,
      errorMessage: null,
      status: 'streaming',
      documentName: 'newer.md',
      attachmentCount: 0,
      createdAt: NOW - 1_000,
      updatedAt: NOW - 500,
    },
    {
      id: 'pinned',
      documentKey: 'path:notes/pinned.md',
      threadId: 'thread-pinned',
      pinned: true,
      source: 'sidebar-tab',
      intent: 'generate',
      scope: 'document',
      outputTarget: 'new-note',
      prompt: 'Pinned prompt',
      resultPreview: 'Pinned result',
      errorMessage: null,
      status: 'done',
      documentName: 'pinned.md',
      attachmentCount: 0,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 9_000,
    },
  ])

  assert.equal(sorted[0]?.id, 'pinned')
})
