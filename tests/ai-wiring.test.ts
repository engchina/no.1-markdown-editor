import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('AIComposer wires request ids and backend cancellation through the desktop client', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')
  const client = await readFile(new URL('../src/lib/ai/client.ts', import.meta.url), 'utf8')
  const rust = await readFile(new URL('../src-tauri/src/ai.rs', import.meta.url), 'utf8')

  assert.match(composer, /const requestId = `\$\{activeTab\?\.id \?\? 'ai'\}-\$\{runId\}-\$\{Date\.now\(\)\}`/)
  assert.match(composer, /await cancelAICompletion\(requestId\)/)
  assert.match(client, /invoke<boolean>\('ai_cancel_completion', \{ requestId \}\)/)
  assert.match(rust, /pub fn ai_cancel_completion/)
  assert.match(rust, /pub request_id: String/)
})

test('editor settings persist AI default preferences', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')

  assert.match(store, /aiDefaultWriteTarget: 'at-cursor'/)
  assert.match(store, /setAiDefaultWriteTarget: \(aiDefaultWriteTarget\) => set\(\{ aiDefaultWriteTarget \}\)/)
  assert.match(store, /aiDefaultSelectedTextRole: 'transform-target'/)
  assert.match(store, /setAiDefaultSelectedTextRole: \(aiDefaultSelectedTextRole\) => set\(\{ aiDefaultSelectedTextRole \}\)/)
  assert.match(store, /aiHistoryProviderRerankEnabled: true/)
  assert.match(store, /setAiHistoryProviderRerankEnabled: \(aiHistoryProviderRerankEnabled\) => set\(\{ aiHistoryProviderRerankEnabled \}\)/)
  assert.match(store, /aiHistoryProviderRerankBudget: 'balanced'/)
  assert.match(store, /setAiHistoryProviderRerankBudget: \(aiHistoryProviderRerankBudget\) => set\(\{ aiHistoryProviderRerankBudget \}\)/)
  assert.match(store, /aiDefaultWriteTarget: s\.aiDefaultWriteTarget/)
  assert.match(store, /aiDefaultSelectedTextRole: s\.aiDefaultSelectedTextRole/)
  assert.match(store, /aiHistoryProviderRerankEnabled: s\.aiHistoryProviderRerankEnabled/)
  assert.match(store, /aiHistoryProviderRerankBudget: s\.aiHistoryProviderRerankBudget/)
})
