import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER,
  createAITemplateOpenDetail,
  getAITemplateDefinitions,
  getAITemplateModels,
  resolveAIComposerTemplateResolution,
} from '../src/lib/ai/templateLibrary.ts'

const t = (key: string) => key

test('AI template library definitions cover the current reusable prompt starters', () => {
  const definitions = getAITemplateDefinitions()

  assert.deepEqual(
    definitions.map((definition) => definition.id),
    ['ask', 'continueWriting', 'translate', 'summarize', 'explain', 'rewrite']
  )
})

test('AI Composer suggestions keep continue writing first while preserving the transform starter order', () => {
  assert.deepEqual(AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER, [
    'continueWriting',
    'translate',
    'summarize',
    'explain',
    'rewrite',
  ])
})

test('AI template library resolves localized models and open details', () => {
  const models = getAITemplateModels(t)
  const byId = Object.fromEntries(models.map((model) => [model.id, model]))

  assert.equal(byId.ask.prompt, '')
  assert.equal(byId.continueWriting.prompt, 'ai.templates.continueWritingPrompt')
  assert.equal(byId.translate.prompt, 'ai.templates.translatePrompt')
  assert.equal(byId.summarize.prompt, 'ai.templates.summarizePrompt')
  assert.equal(byId.explain.prompt, 'ai.templates.explainPrompt')
  assert.equal(byId.rewrite.prompt, 'ai.templates.rewritePrompt')

  assert.deepEqual(createAITemplateOpenDetail('translate', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'edit',
    outputTarget: 'replace-selection',
    prompt: 'ai.templates.translatePrompt',
  })
  assert.deepEqual(createAITemplateOpenDetail('explain', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'ask',
    outputTarget: 'chat-only',
    prompt: 'ai.templates.explainPrompt',
  })
  assert.deepEqual(createAITemplateOpenDetail('rewrite', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'edit',
    outputTarget: 'replace-selection',
    prompt: 'ai.templates.rewritePrompt',
  })
})

test('AI composer template resolution prefers selection, falls back to current block, enables slash-context transforms, and disables block-aware actions when no target is available', () => {
  const models = getAITemplateModels(t)
  const translate = models.find((model) => model.id === 'translate')
  const explain = models.find((model) => model.id === 'explain')

  assert.ok(translate)
  assert.ok(explain)
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: true,
      hasCurrentBlock: true,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'selection',
      outputTarget: 'replace-selection',
      enabled: true,
      targetKind: 'selection',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: false,
      hasCurrentBlock: true,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'current-block',
      outputTarget: 'replace-current-block',
      enabled: true,
      targetKind: 'current-block',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(explain!, {
      hasSelection: false,
      hasCurrentBlock: true,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'ask',
      scope: 'current-block',
      outputTarget: 'chat-only',
      enabled: true,
      targetKind: 'current-block',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: false,
      hasCurrentBlock: false,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'document',
      outputTarget: 'at-cursor',
      enabled: true,
      targetKind: 'slash-context',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(explain!, {
      hasSelection: false,
      hasCurrentBlock: false,
      hasSlashCommandContext: true,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'ask',
      scope: 'document',
      outputTarget: 'chat-only',
      enabled: true,
      targetKind: 'slash-context',
    }
  )
  assert.deepEqual(
    resolveAIComposerTemplateResolution(translate!, {
      hasSelection: false,
      hasCurrentBlock: false,
      hasSlashCommandContext: false,
      aiDefaultWriteTarget: 'insert-below',
    }),
    {
      intent: 'edit',
      scope: 'current-block',
      outputTarget: 'replace-current-block',
      enabled: false,
      targetKind: null,
    }
  )
})

test('AI Composer suggestion chips expose reusable template entry points directly', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /getAITemplateModels\(t\)/)
  assert.match(composer, /<AIQuickChips/)
  assert.match(composer, /function AIQuickChips\(/)
  assert.match(composer, /AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER/)
  assert.match(composer, /data-ai-template=\{template\.id\}/)
  assert.match(composer, /t\('ai\.mode\.suggestions'\)/)
  assert.doesNotMatch(composer, /data-ai-template-target=/)
  assert.doesNotMatch(composer, /t\('ai\.mode\.target'\)/)
  assert.doesNotMatch(composer, /t\('ai\.templateLibrary\.title'\)/)
})
