import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAIContextChipModels } from '../src/lib/ai/contextChips.ts'
import type { AIContextPacket } from '../src/lib/ai/types.ts'

const baseContext: AIContextPacket = {
  tabId: 'tab-1',
  tabPath: 'notes/demo.md',
  fileName: 'demo.md',
  documentLanguage: 'ja',
  intent: 'edit',
  scope: 'selection',
  outputTarget: 'replace-selection',
  selectedText: '選択された本文',
  selectedTextRole: 'transform-target',
  beforeText: '前文',
  afterText: '後文',
  currentBlock: '選択された本文',
  headingPath: ['Intro', 'Details'],
  frontMatter: '---\ntitle: Demo\n---',
  explicitContextAttachments: [
    {
      id: 'note:project',
      kind: 'note',
      label: 'project-plan.md',
      detail: 'notes/project-plan.md',
      content: '# Plan',
    },
    {
      id: 'search:roadmap',
      kind: 'search',
      label: 'roadmap',
      detail: '2 hits across 1 note',
      content: 'Workspace search for "roadmap":\n- demo.md:8',
    },
  ],
}

test('buildAIContextChipModels mirrors the visible context that should be shown to the user', () => {
  assert.deepEqual(buildAIContextChipModels(baseContext), [
    { kind: 'selection' },
    { kind: 'block' },
    { kind: 'heading', value: 'Details' },
    { kind: 'language', value: 'ja' },
    { kind: 'frontMatter' },
    { kind: 'note', value: 'project-plan.md' },
    { kind: 'search', value: 'roadmap' },
  ])
})

test('buildAIContextChipModels omits chips for absent context parts', () => {
  const minimal = {
    ...baseContext,
    selectedText: undefined,
    currentBlock: undefined,
    headingPath: undefined,
    frontMatter: null,
    explicitContextAttachments: undefined,
  }
  assert.deepEqual(buildAIContextChipModels(minimal), [{ kind: 'language', value: 'ja' }])
})
