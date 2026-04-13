import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAIRequestMessages, normalizeAIDraftText } from '../src/lib/ai/prompt.ts'
import type { AIContextPacket } from '../src/lib/ai/types.ts'

const baseContext: AIContextPacket = {
  tabId: 'tab-1',
  tabPath: 'notes/demo.md',
  fileName: 'demo.md',
  documentLanguage: 'en',
  intent: 'edit',
  scope: 'selection',
  outputTarget: 'replace-selection',
  selectedText: 'Hello world',
  selectedTextRole: 'transform-target',
  beforeText: 'Before context',
  afterText: 'After context',
  currentBlock: 'Hello world',
  headingPath: ['Intro'],
  frontMatter: '---\ntitle: Demo\n---',
}

test('buildAIRequestMessages creates system and user messages with visible context sections', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Rewrite this in a concise tone.',
    context: baseContext,
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /Markdown editor/u)
  assert.match(messages[0].content, /standards-compliant Markdown/u)
  assert.match(messages[0].content, /ATX headings/u)
  assert.match(messages[0].content, /XML-like context tags/u)
  assert.match(messages[1].content, /Rewrite this in a concise tone\./u)
  assert.match(messages[1].content, /Input source: selected-text/u)
  assert.match(messages[1].content, /Input role: transform-target/u)
  assert.match(messages[1].content, /<input_content>/u)
  assert.match(messages[1].content, /<\/input_content>/u)
  assert.doesNotMatch(messages[1].content, /Intent:/u)
  assert.doesNotMatch(messages[1].content, /Scope:/u)
  assert.doesNotMatch(messages[1].content, /Output target:/u)
  assert.doesNotMatch(messages[1].content, /File:/u)
  assert.doesNotMatch(messages[1].content, /Heading path/u)
  assert.doesNotMatch(messages[1].content, /Front matter/u)
  assert.doesNotMatch(messages[1].content, /Current block/u)
  assert.doesNotMatch(messages[1].content, /After context/u)
  assert.doesNotMatch(messages[1].content, /Before context/u)
  assert.doesNotMatch(messages[1].content, /Selected text/u)
})

test('buildAIRequestMessages keeps the system prompt free of output target, intent, and language-specific guidance', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Create a knowledge note from this section.',
    context: {
      ...baseContext,
      intent: 'generate',
      scope: 'current-block',
      outputTarget: 'new-note',
      selectedTextRole: 'reference-only',
    },
  })

  assert.doesNotMatch(messages[0].content, /self-contained new note/u)
  assert.doesNotMatch(messages[0].content, /Answer the user question clearly/u)
  assert.doesNotMatch(messages[0].content, /Edit only the intended target text or block/u)
  assert.doesNotMatch(messages[0].content, /Generate content that fits naturally/u)
  assert.doesNotMatch(messages[0].content, /Review the content and point out issues/u)
  assert.doesNotMatch(messages[0].content, /The document language is primarily/u)
  assert.doesNotMatch(messages[0].content, /Selected text is reference-only context/u)
})

test('buildAIRequestMessages does not expose explicit attached context sections in the user message', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Compare the selected text against the attached references.',
    context: {
      ...baseContext,
      explicitContextAttachments: [
        {
          id: 'note:1',
          kind: 'note',
          label: 'project-plan.md',
          detail: 'notes/project-plan.md',
          content: '# Plan\n\nMilestone: ship AI mentions.',
          query: 'project plan',
        },
        {
          id: 'search:1',
          kind: 'search',
          label: 'Milestone',
          detail: '1 hit across 1 note',
          content: 'Workspace search for "Milestone":\n\n- project-plan.md:3\n  Milestone: ship AI mentions.',
          query: 'Milestone',
        },
      ],
    },
  })

  assert.doesNotMatch(messages[0].content, /Use only the explicit attached note, heading, and search context/u)
  assert.doesNotMatch(messages[1].content, /Attached note/u)
  assert.doesNotMatch(messages[1].content, /Attached workspace search/u)
})

test('buildAIRequestMessages includes hidden slash-command prefix context without exposing it as selected text', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Continue from here.',
    context: {
      ...baseContext,
      intent: 'generate',
      scope: 'current-block',
      outputTarget: 'at-cursor',
      selectedText: undefined,
      selectedTextRole: undefined,
      slashCommandContext: {
        strategy: 'before-trigger',
        text: '# Intro\n\nLead paragraph.',
        isEmpty: false,
      },
    },
  })

  assert.match(messages[1].content, /Input source: slash-prefix/u)
  assert.match(messages[1].content, /Input role: continuation-context/u)
  assert.match(messages[1].content, /<input_content>/u)
  assert.match(messages[1].content, /Lead paragraph\./u)
  assert.doesNotMatch(messages[1].content, /Selected text/u)
  assert.doesNotMatch(messages[1].content, /Before context/u)
  assert.doesNotMatch(messages[1].content, /Slash command context \(hidden from the composer UI, content before the "\/" trigger\):/u)
})

test('buildAIRequestMessages prioritizes slash-prefix input over selected text when both are present', () => {
  const messages = buildAIRequestMessages({
    prompt: 'Continue from here.',
    context: {
      ...baseContext,
      selectedText: 'This selection should be ignored.',
      selectedTextRole: 'reference-only',
      slashCommandContext: {
        strategy: 'before-trigger',
        text: '# Intro\n\nLead paragraph.',
        isEmpty: false,
      },
    },
  })

  assert.match(messages[1].content, /Input source: slash-prefix/u)
  assert.match(messages[1].content, /Input role: continuation-context/u)
  assert.match(messages[1].content, /Lead paragraph\./u)
  assert.doesNotMatch(messages[1].content, /This selection should be ignored\./u)
  assert.doesNotMatch(messages[1].content, /Input source: selected-text/u)
  assert.doesNotMatch(messages[1].content, /Input role: reference-only/u)
})

test('normalizeAIDraftText removes surrounding markdown fences for insertion targets', () => {
  const normalized = normalizeAIDraftText('```markdown\n# Hello\n```', 'replace-selection')
  assert.equal(normalized, '# Hello')
})

test('normalizeAIDraftText normalizes missing spaces in ATX headings for document insertion targets', () => {
  const normalized = normalizeAIDraftText(['##123', '', '###标题', '', '####Heading'].join('\n'), 'replace-selection')
  assert.equal(normalized, ['## 123', '', '### 标题', '', '#### Heading'].join('\n'))
})

test('normalizeAIDraftText preserves non-markdown fenced blocks such as code and mermaid', () => {
  const codeBlock = '```\nconsole.log("hello")\n```'
  const mermaidBlock = '```mermaid\nflowchart TD\nA-->B\n```'

  assert.equal(normalizeAIDraftText(codeBlock, 'replace-selection'), codeBlock)
  assert.equal(normalizeAIDraftText(mermaidBlock, 'replace-selection'), mermaidBlock)
})

test('normalizeAIDraftText does not rewrite heading-like lines inside fenced blocks', () => {
  const draft = [
    '##123',
    '',
    '```md',
    '##456',
    '###InsideFence',
    '```',
    '',
    '###OutsideFence',
  ].join('\n')

  assert.equal(
    normalizeAIDraftText(draft, 'replace-selection'),
    [
      '## 123',
      '',
      '```md',
      '##456',
      '###InsideFence',
      '```',
      '',
      '### OutsideFence',
    ].join('\n')
  )
})

test('normalizeAIDraftText preserves bare fenced blocks instead of assuming they are markdown wrappers', () => {
  const bareFence = '```\n# This might be an intended fenced block\n```'
  assert.equal(normalizeAIDraftText(bareFence, 'replace-selection'), bareFence)
})

test('normalizeAIDraftText keeps chat-only replies intact apart from trimming', () => {
  const normalized = normalizeAIDraftText('  Here is the answer.  ', 'chat-only')
  assert.equal(normalized, 'Here is the answer.')
})
