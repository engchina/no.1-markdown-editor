import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('persisted editor settings do not store AI secrets or transient AI request state', async () => {
  const store = await readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8')
  const aiStore = await readFile(new URL('../src/store/ai.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(store, /apiKey/u)
  assert.doesNotMatch(store, /baseUrl/u)
  assert.doesNotMatch(store, /project/u)
  assert.doesNotMatch(store, /draftText/u)
  assert.match(aiStore, /threadIdsByDocument/u)
  assert.match(aiStore, /sessionHistoryByDocument/u)
  assert.match(aiStore, /historyRetentionPreset/u)
  assert.match(aiStore, /persist\(/u)
  assert.doesNotMatch(aiStore, /partialize:\s*\(state\)\s*=>\s*\(\{[^}]*draftText/su)
})

test('AIComposer request execution writes draft state only and does not apply document changes before explicit apply', async () => {
  const composer = await readFile(new URL('../src/components/AI/AIComposer.tsx', import.meta.url), 'utf8')

  assert.match(composer, /const response = await runAICompletion\(/)
  assert.match(composer, /onChunk: \(chunk\) => \{/)
  assert.match(composer, /appendDraftText\(chunk\)/)
  assert.match(composer, /setDraftText\(draft\)/)
  assert.doesNotMatch(composer, /dispatchEditorAIApply\(\{\s*tabId: activeTab\.id,\s*outputTarget: composer\.outputTarget,\s*text: draft/su)
})

test('CodeMirrorEditor blocks stale AI apply attempts before dispatching document edits', async () => {
  const editor = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(editor, /if \(isAIApplySnapshotStale\(detail\.snapshot, currentDoc\)\)/)
  assert.match(editor, /pushErrorNotice\('notices\.aiApplyConflictTitle', 'notices\.aiApplyConflictMessage'\)/)
})
