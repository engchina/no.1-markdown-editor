import assert from 'node:assert/strict'
import test from 'node:test'
import { useEditorStore } from '../src/store/editor.ts'

test('saveTab keeps the tab dirty when edits arrived while the write was in flight', () => {
  const tabId = useEditorStore.getState().addTab({
    name: 'race.md',
    content: '# Draft',
    savedContent: '',
    isDirty: true,
  })
  useEditorStore.getState().setTabPath(tabId, 'C:\\notes\\race.md', 'race.md')

  // Simulates the async save flow: the disk write starts with a snapshot of
  // the content, the user keeps typing, then the save completes.
  const writtenSnapshot = '# Draft'
  useEditorStore.getState().updateTabContent(tabId, '# Draft typed-during-save')
  useEditorStore.getState().saveTab(tabId, writtenSnapshot)

  const tab = useEditorStore.getState().tabs.find((entry) => entry.id === tabId)
  assert.ok(tab)
  assert.equal(tab.savedContent, writtenSnapshot)
  assert.equal(tab.content, '# Draft typed-during-save')
  assert.equal(tab.isDirty, true, 'edits made during the disk write must stay dirty')

  useEditorStore.getState().closeTab(tabId)
})

test('saveTab marks the tab clean when the written content matches the latest content', () => {
  const tabId = useEditorStore.getState().addTab({
    name: 'clean.md',
    content: '# Stable',
    savedContent: '',
    isDirty: true,
  })

  useEditorStore.getState().saveTab(tabId, '# Stable')

  const tab = useEditorStore.getState().tabs.find((entry) => entry.id === tabId)
  assert.ok(tab)
  assert.equal(tab.savedContent, '# Stable')
  assert.equal(tab.isDirty, false)

  useEditorStore.getState().closeTab(tabId)
})
