import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAIHistoryWorkspaceRunPrompt,
  collectAIHistoryWorkspaceHandoffTargets,
} from '../src/lib/ai/historyWorkspaceHandoff.ts'

const NOW = Date.now()

test('collectAIHistoryWorkspaceHandoffTargets dedupes documents and skips the current document', () => {
  const targets = collectAIHistoryWorkspaceHandoffTargets(
    [
      {
        candidate: {
          id: 'same-doc',
          documentKey: 'path:notes/current.md',
          threadId: 'thread-1',
          pinned: false,
          source: 'shortcut',
          intent: 'review',
          scope: 'document',
          outputTarget: 'chat-only',
          prompt: 'Review current note',
          resultPreview: null,
          errorMessage: null,
          status: 'done',
          documentName: 'current.md',
          attachmentCount: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
        score: 88,
        matchKind: 'semantic',
        matchedTerms: [],
      },
      {
        candidate: {
          id: 'release-plan',
          documentKey: 'path:notes/release-plan.md',
          threadId: 'thread-2',
          pinned: true,
          source: 'shortcut',
          intent: 'review',
          scope: 'document',
          outputTarget: 'chat-only',
          prompt: 'Review release plan',
          resultPreview: null,
          errorMessage: null,
          status: 'done',
          documentName: 'release-plan.md',
          attachmentCount: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
        score: 92,
        matchKind: 'semantic',
        matchedTerms: [],
      },
      {
        candidate: {
          id: 'release-plan-duplicate',
          documentKey: 'path:notes/release-plan.md',
          threadId: 'thread-3',
          pinned: false,
          source: 'shortcut',
          intent: 'ask',
          scope: 'document',
          outputTarget: 'chat-only',
          prompt: 'Ask about release plan',
          resultPreview: null,
          errorMessage: null,
          status: 'done',
          documentName: 'release-plan.md',
          attachmentCount: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
        score: 77,
        matchKind: 'lexical',
        matchedTerms: [],
      },
      {
        candidate: {
          id: 'draft-retro',
          documentKey: 'draft:draft-retro',
          threadId: 'thread-4',
          pinned: false,
          source: 'shortcut',
          intent: 'review',
          scope: 'document',
          outputTarget: 'chat-only',
          prompt: 'Review retrospective draft',
          resultPreview: null,
          errorMessage: null,
          status: 'done',
          documentName: 'retro draft',
          attachmentCount: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
        score: 70,
        matchKind: 'semantic',
        matchedTerms: [],
      },
    ],
    {
      currentDocumentKey: 'path:notes/current.md',
      limit: 4,
    }
  )

  assert.deepEqual(
    targets.map((target) => ({ query: target.query, detail: target.detail })),
    [
      { query: 'notes/release-plan.md', detail: 'notes/release-plan.md' },
      { query: 'retro draft', detail: 'Unsaved draft session' },
    ]
  )
})

test('buildAIHistoryWorkspaceRunPrompt prepends note mentions and preserves the workspace template prompt', () => {
  const prompt = buildAIHistoryWorkspaceRunPrompt({
    targets: [
      {
        documentKey: 'path:notes/release-plan.md',
        query: 'notes/release-plan.md',
        label: 'release-plan.md',
        detail: 'notes/release-plan.md',
      },
      {
        documentKey: 'path:notes/checklist.md',
        query: 'notes/checklist.md',
        label: 'checklist.md',
        detail: 'notes/checklist.md',
      },
    ],
    templatePrompt: 'Return a coordinated workspace execution plan.',
    seedQuery: 'release owners',
    scopeLabel: 'saved view "Release Prep"',
  })

  assert.match(prompt, /@note\(notes\/release-plan\.md\) @note\(notes\/checklist\.md\)/)
  assert.match(prompt, /Use the attached notes surfaced from saved view "Release Prep"\./)
  assert.match(prompt, /Source retrieval query: "release owners"\./)
  assert.match(prompt, /Return a coordinated workspace execution plan\./)
})
