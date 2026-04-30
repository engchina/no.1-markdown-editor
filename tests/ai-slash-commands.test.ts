import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  buildAISlashCommandContext,
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

  assert.deepEqual(entries.map((entry) => entry.id), [
    'continue',
    'ai',
    'rewrite',
    'translate',
    'summarize',
    'explain',
  ])
  assert.deepEqual(byId.ai.openDetail, {
    source: 'slash-command',
    intent: 'ask',
    outputTarget: 'chat-only',
  })
  assert.equal(byId.continue.label, 'continue')
  assert.equal(byId.continue.openDetail.source, 'slash-command')
  assert.equal(byId.continue.openDetail.prompt, 'ai.templates.continueWritingPrompt')
  assert.equal(byId.rewrite.openDetail.prompt, 'ai.templates.rewritePrompt')
  assert.equal(byId.translate.openDetail.prompt, 'ai.templates.translatePrompt')
  assert.equal(byId.summarize.openDetail.prompt, 'ai.templates.summarizePrompt')
  assert.equal(byId.explain.openDetail.outputTarget, 'chat-only')
  assert.equal(entries.length, 6)
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
  assert.deepEqual(resolveAISlashCommandTrigger('notes /rewrite', entries), {
    entry: entries.find((entry) => entry.id === 'rewrite'),
    query: 'rewrite',
    from: 6,
    to: 14,
  })
  assert.deepEqual(resolveAISlashCommandTrigger('notes /continue', entries), {
    entry: entries.find((entry) => entry.id === 'continue'),
    query: 'continue',
    from: 6,
    to: 15,
  })
})

test('buildAISlashCommandContext returns trimmed text before the slash trigger', () => {
  assert.equal(buildAISlashCommandContext('  Draft paragraph.\n\nNext idea  '), 'Draft paragraph.\n\nNext idea')
  assert.equal(buildAISlashCommandContext('First line<br />Second line'), 'First line\nSecond line')
  assert.equal(buildAISlashCommandContext('   '), undefined)
  assert.equal(buildAISlashCommandContext('   <br />  '), undefined)
  assert.equal(buildAISlashCommandContext(' <br><br/> \n <br /> '), undefined)
})

test('slash commands expose context from text before the slash trigger', async () => {
  const slashCommands = await readFile(new URL('../src/lib/ai/slashCommands.ts', import.meta.url), 'utf8')
  const prompt = await readFile(new URL('../src/lib/ai/prompt.ts', import.meta.url), 'utf8')

  assert.match(slashCommands, /buildAISlashCommandContext/)
  assert.match(prompt, /Input source: slash-prefix/)
  assert.match(prompt, /Input role: context-before-cursor/)
})

test('editor autocomplete includes slash-triggered AI command entries that dispatch the shared AI open event', async () => {
  const optionalFeatures = await readFile(new URL('../src/components/Editor/optionalFeatures.ts', import.meta.url), 'utf8')
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(optionalFeatures, /createAISlashCommandEntries\(i18n\.t\.bind\(i18n\)\)/)
  assert.match(optionalFeatures, /buildAISlashCommandContext\(view\.state\.sliceDoc\(0, from\)\)/)
  assert.match(optionalFeatures, /dispatchEditorAIOpen\(\{\s*\.\.\.entry\.openDetail,/)
  assert.match(optionalFeatures, /slashCommandContext/)
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
  assert.doesNotMatch(optionalFeatures, /before\.slice\(0, match\.from\)\.trim\(\)\.length > 0/)
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
