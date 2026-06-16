import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBrowserWebviewLabel,
  getBrowserWebviewLabels,
} from '../src/lib/browser/webviewVisibility.ts'

test('browser webview visibility helpers derive labels only for browser tabs', () => {
  assert.equal(getBrowserWebviewLabel('tab-1'), 'browser-tab-1')
  assert.deepEqual(
    getBrowserWebviewLabels([
      { id: 'markdown-1', type: 'markdown' },
      { id: 'browser-1', type: 'browser' },
      { id: 'legacy-markdown' },
      { id: 'browser-2', type: 'browser' },
    ]),
    ['browser-browser-1', 'browser-browser-2']
  )
})
