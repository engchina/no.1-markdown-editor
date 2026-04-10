import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareImageMarkdownInsertion } from '../src/lib/imageMarkdownInsertion.ts'

test('prepareImageMarkdownInsertion appends a newline after persisted image markdown', () => {
  const markdown = '![clipboard image](./images/image-11.png)'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown), {
    text: `${markdown}\n`,
    selectionOffset: markdown.length + 1,
  })
})

test('prepareImageMarkdownInsertion reuses an existing following newline', () => {
  const markdown = '![clipboard image](./images/image-11.png)'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown, '\nNext paragraph'), {
    text: markdown,
    selectionOffset: markdown.length + 1,
  })
})

test('prepareImageMarkdownInsertion appends a newline after base64 image markdown', () => {
  const markdown = '![clipboard image](data:image/png;base64,AQID)'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown), {
    text: `${markdown}\n`,
    selectionOffset: markdown.length + 1,
  })
})

test('prepareImageMarkdownInsertion keeps an existing trailing newline intact', () => {
  const markdown = '![clipboard image](./images/image-11.png)\n'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown, '\nNext paragraph'), {
    text: markdown,
    selectionOffset: markdown.length,
  })
})
