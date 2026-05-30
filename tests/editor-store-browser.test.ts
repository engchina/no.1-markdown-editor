import assert from 'node:assert/strict'
import test from 'node:test'
import { useEditorStore } from '../src/store/editor.ts'
import { DEFAULT_BROWSER_URL } from '../src/lib/browser/defaults.ts'

test('editor store updateTabUrl updates tab URL and name based on parsed hostname', () => {
  // Add a browser tab
  const tabId = useEditorStore.getState().addTab({
    type: 'browser',
    url: DEFAULT_BROWSER_URL,
    name: 'Browser',
  })

  // Check initial state
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId)
  assert.ok(tab)
  assert.equal(tab.type, 'browser')
  assert.equal(tab.url, DEFAULT_BROWSER_URL)
  assert.equal(tab.name, 'Browser')

  // Update URL to a different site
  useEditorStore.getState().updateTabUrl(tabId, 'https://github.com/engchina')

  // Check updated state
  const updatedTab = useEditorStore.getState().tabs.find((t) => t.id === tabId)
  assert.ok(updatedTab)
  assert.equal(updatedTab.url, 'https://github.com/engchina')
  // The store's updateTabUrl should extract host name (github.com) as the name
  assert.equal(updatedTab.name, 'github.com')

  // Clean up tab
  useEditorStore.getState().closeTab(tabId)
})
