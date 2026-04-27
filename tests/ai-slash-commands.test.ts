import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  createAISlashCommandEntries,
  matchAISlashCommandQuery,
  resolveAISlashCommandTrigger,
} from '../src/lib/ai/slashCommands.ts'
import { createAIQuickActionOpenDetail } from '../src/lib/ai/quickActions.ts'

const t = (key: string) => key

test('createAIQuickActionOpenDetail supports overriding the composer source', () => {
  assert.deepEqual(createAIQuickActionOpenDetail('ask', t, 'slash-command'), {
    source: 'slash-command',
    intent: 'ask',
    outputTarget: 'chat-only',
  })

  assert.deepEqual(createAIQuickActionOpenDetail('continueWriting', t, 'command-palette'), {
    source: 'command-palette',
    intent: 'generate',
    outputTarget: 'at-cursor',
    prompt: 'ai.templates.continueWritingPrompt',
  })
})

test('createAISlashCommandEntries maps slash labels to the expected AI open details', () => {
  const entries = createAISlashCommandEntries(t)
  const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]))

  assert.deepEqual(byId.ai.openDetail, {
    source: 'slash-command',
    intent: 'ask',
    outputTarget: 'chat-only',
  })
  assert.equal(byId.continue.label, 'continue')
  assert.equal(byId.continue.openDetail.source, 'slash-command')
  assert.equal(byId.continue.openDetail.prompt, 'ai.templates.continueWritingPrompt')
  assert.equal(entries.length, 2)
  assert.equal('translate' in byId, false)
  assert.equal('rewrite' in byId, false)
  assert.equal('summarize' in byId, false)
})

test('matchAISlashCommandQuery identifies slash command prefixes at the end of a line', () => {
  assert.deepEqual(matchAISlashCommandQuery('/ai'), {
    query: 'ai',
    from: 0,
    to: 3,
  })

  assert.deepEqual(matchAISlashCommandQuery('Write next /sum'), {
    query: 'sum',
    from: 11,
    to: 15,
  })

  assert.equal(matchAISlashCommandQuery('https://example.com/ai'), null)
})

test('resolveAISlashCommandTrigger only returns exact AI slash commands', () => {
  const entries = createAISlashCommandEntries(t)

  assert.equal(resolveAISlashCommandTrigger('/rew', entries), null)
  assert.equal(resolveAISlashCommandTrigger('notes /table', entries), null)
  assert.equal(resolveAISlashCommandTrigger('notes /rewrite', entries), null)
  assert.deepEqual(resolveAISlashCommandTrigger('notes /continue', entries), {
    entry: entries.find((entry) => entry.id === 'continue'),
    query: 'continue',
    from: 6,
    to: 15,
  })
})

test('slash commands do not expose a helper for attaching text before the slash trigger', async () => {
  const slashCommands = await readFile(new URL('../src/lib/ai/slashCommands.ts', import.meta.url), 'utf8')
  const prompt = await readFile(new URL('../src/lib/ai/prompt.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(slashCommands, /buildAISlashCommandContext/)
  assert.doesNotMatch(slashCommands, /before-trigger/)
  assert.doesNotMatch(prompt, /slash-prefix/)
  assert.doesNotMatch(prompt, /continuation-context/)
})

test('editor autocomplete includes slash-triggered AI command entries that dispatch the shared AI open event', async () => {
  const optionalFeatures = await readFile(new URL('../src/components/Editor/optionalFeatures.ts', import.meta.url), 'utf8')
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(optionalFeatures, /createAISlashCommandEntries\(i18n\.t\.bind\(i18n\)\)/)
  assert.match(optionalFeatures, /dispatchEditorAIOpen\(entry\.openDetail\)/)
  assert.match(optionalFeatures, /changes: \{ from, to, insert: '' \ }|changes: \{ from, to, insert: '' \}/)
  assert.match(optionalFeatures, /closeCompletion\?\.\(view\)/)
  assert.match(optionalFeatures, /section: i18n\.t\('ai\.slash\.group'\)/)
  assert.match(optionalFeatures, /options: snippets,/)
  assert.match(optionalFeatures, /defaultKeymap: true/)
  assert.match(optionalFeatures, /interactionDelay: 0/)
  assert.match(optionalFeatures, /if \(text !== '\/'\) return false/)
  assert.match(optionalFeatures, /selection: \{ anchor: from \+ text\.length \}/)
  assert.match(optionalFeatures, /EditorView\.inputHandler\.of/)
  assert.match(optionalFeatures, /resolveAISlashCommandTrigger\(before, slashCommandEntries\)/)
  assert.match(optionalFeatures, /key: 'Enter'/)
  assert.match(optionalFeatures, /key: 'Space'/)
  assert.match(optionalFeatures, /filter: false,\s*validFor: \/\^\[a-z0-9-\]\*\$\/i/)
  assert.doesNotMatch(optionalFeatures, /ai\.slash\.markdownGroup/)
  assert.doesNotMatch(optionalFeatures, /keymap\.of\(\[\.\.\.autocomplete\.closeBracketsKeymap, \.\.\.autocomplete\.completionKeymap\]\)/)
  assert.match(editor, /useEffect\(\(\) => {\s*void ensureAutocompleteExtensions\(\)/)
  assert.match(editor, /autocompleteCompartmentRef\.current\.of\(autocompleteExtensions\)/)
  assert.doesNotMatch(editor, /autocompleteCompartmentRef\.current\.of\(\[\]\)/)
  assert.match(editor, /setTimeout\(callback, 0\)/)
  assert.match(editor, /const activeView = viewRef\.current/)
  assert.match(editor, /const currentView = viewRef\.current/)
  assert.match(editor, /autocomplete\.startCompletion\(currentView\)/)
})
