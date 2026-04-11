import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  createAITemplateOpenDetail,
  getAITemplateDefinitions,
  getAITemplateModels,
} from '../src/lib/ai/templateLibrary.ts'

const t = (key: string) => key

test('AI template library definitions cover the current reusable prompt starters', () => {
  const definitions = getAITemplateDefinitions()

  assert.deepEqual(
    definitions.map((definition) => definition.id),
    ['ask', 'continueWriting', 'translate', 'summarize', 'explain', 'rewrite']
  )
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
  assert.deepEqual(createAITemplateOpenDetail('explain', t, 'sidebar-tab'), {
    source: 'sidebar-tab',
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

test('AI Composer suggestion chips and AI sidebar prompt library both expose template entry points', async () => {
  const [composer, rail] = await Promise.all([
    readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/AISidebarPeekRail.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(composer, /getAITemplateModels\(t\)/)
  assert.match(composer, /<AIQuickChips/)
  assert.match(composer, /function AIQuickChips\(/)
  assert.match(composer, /AI_COMPOSER_SUGGESTION_TEMPLATE_ORDER/)
  assert.match(composer, /data-ai-template=\{template\.id\}/)
  assert.match(composer, /t\('ai\.mode\.suggestions'\)/)
  assert.doesNotMatch(composer, /t\('ai\.templateLibrary\.title'\)/)
  assert.match(rail, /getAITemplateModels\(t\)\.filter\(\(tmpl\) => tmpl\.id !== 'ask'\)/)
  assert.match(rail, /data-ai-sidebar-template=\{template\.id\}/)
  assert.match(rail, /createAITemplateOpenDetail\(template\.id, t, SIDEBAR_TAB_SOURCE\)/)
})
