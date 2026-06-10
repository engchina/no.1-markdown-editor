import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'

async function readAiRustSources(): Promise<string> {
  const dir = new URL('../src-tauri/src/ai/', import.meta.url)
  const entries = (await readdir(dir)).filter((name) => name.endsWith('.rs')).sort()
  const sources = await Promise.all(entries.map((name) => readFile(new URL(name, dir), 'utf8')))
  return sources.join('\n')
}

test('AIComposer wires request ids and backend cancellation through the desktop client', async () => {
  const runtime = await readFile(new URL('../src/components/AI/useAIComposerRuntime.ts', import.meta.url), 'utf8')
  const client = await readFile(new URL('../src/lib/ai/client.ts', import.meta.url), 'utf8')
  const rust = await readAiRustSources()

  assert.match(runtime, /const requestId = `\$\{activeTab\?\.id \?\? 'ai'\}-\$\{runId\}-\$\{Date\.now\(\)\}`/)
  assert.match(runtime, /await cancelAICompletion\(requestId\)/)
  assert.match(client, /invoke<boolean>\('ai_cancel_completion', \{ requestId \}\)/)
  assert.match(rust, /pub fn ai_cancel_completion/)
  assert.match(rust, /pub request_id: String/)
})

test('editor settings pin fixed AI defaults and stop persisting hidden AI preference controls', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(store, /aiDefaultWriteTarget: 'insert-below'/)
  assert.match(store, /aiDefaultSelectedTextRole: 'transform-target'/)
  assert.match(store, /aiHistoryProviderRerankEnabled: true/)
  assert.match(store, /aiHistoryProviderRerankBudget: 'balanced'/)
  assert.doesNotMatch(store, /setAiDefaultWriteTarget: /)
  assert.doesNotMatch(store, /setAiDefaultSelectedTextRole: /)
  assert.doesNotMatch(store, /setAiHistoryProviderRerankEnabled: /)
  assert.doesNotMatch(store, /setAiHistoryProviderRerankBudget: /)
  assert.doesNotMatch(store, /aiDefaultWriteTarget: s\.aiDefaultWriteTarget/)
  assert.doesNotMatch(store, /aiDefaultSelectedTextRole: s\.aiDefaultSelectedTextRole/)
  assert.doesNotMatch(store, /aiHistoryProviderRerankEnabled: s\.aiHistoryProviderRerankEnabled/)
  assert.doesNotMatch(store, /aiHistoryProviderRerankBudget: s\.aiHistoryProviderRerankBudget/)
  assert.match(
    store,
    /return \{\s*\.\.\.mergedState,[\s\S]*aiDefaultWriteTarget: 'insert-below',[\s\S]*aiDefaultSelectedTextRole: 'transform-target',[\s\S]*aiHistoryProviderRerankEnabled: true,[\s\S]*aiHistoryProviderRerankBudget: 'balanced',[\s\S]*\}/
  )
})
