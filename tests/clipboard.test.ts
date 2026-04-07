import assert from 'node:assert/strict'
import test from 'node:test'
import { clipboardHasType, readClipboardString, type ClipboardDataLike } from '../src/lib/clipboard.ts'

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
