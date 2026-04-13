import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clipboardHasType,
  readClipboardString,
  readClipboardStringBestEffort,
  type ClipboardApiLike,
  type ClipboardDataLike,
} from '../src/lib/clipboard.ts'

test('clipboardHasType detects html from DataTransfer items when getData is empty', () => {
  const clipboardData: ClipboardDataLike = {
    getData: () => '',
    items: [
      {
        kind: 'string',
        type: 'text/html',
        getAsString: () => {},
      },
    ],
  }

  assert.equal(clipboardHasType(clipboardData, 'text/html'), true)
})

test('readClipboardString falls back to DataTransfer items for html fragments', async () => {
  const clipboardData: ClipboardDataLike = {
    getData: () => '',
    items: [
      {
        kind: 'string',
        type: 'text/html',
        getAsString: (callback) => callback('<h1>Markdown Reference</h1>'),
      },
    ],
  }

  const html = await readClipboardString(clipboardData, 'text/html')

  assert.equal(html, '<h1>Markdown Reference</h1>')
})

test('readClipboardStringBestEffort falls back to navigator clipboard text when event data is empty', async () => {
  const clipboardData: ClipboardDataLike = {
    getData: () => '',
    items: [],
    types: ['text/plain'],
  }
  const clipboardApi: ClipboardApiLike = {
    readText: async () => '```math\n\\sum_{i=1}^{n} a_i\n```',
  }

  const text = await readClipboardStringBestEffort(clipboardData, 'text/plain', clipboardApi)

  assert.equal(text, '```math\n\\sum_{i=1}^{n} a_i\n```')
})

test('readClipboardStringBestEffort falls back to navigator clipboard html when event data is empty', async () => {
  const clipboardData: ClipboardDataLike = {
    getData: () => '',
    items: [],
    types: ['text/html'],
  }
  const clipboardApi: ClipboardApiLike = {
    read: async () => [
      {
        types: ['text/html'],
        getType: async () => ({
          text: async () => '<pre><code class="language-math">\\sum_{i=1}^{n} a_i</code></pre>',
        }),
      },
    ],
  }

  const html = await readClipboardStringBestEffort(clipboardData, 'text/html', clipboardApi)

  assert.equal(html, '<pre><code class="language-math">\\sum_{i=1}^{n} a_i</code></pre>')
})
