import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareImageMarkdownInsertion } from '../src/lib/imageMarkdownInsertion.ts'

test('prepareImageMarkdownInsertion keeps persisted image markdown unchanged', () => {
  const markdown = '![clipboard image](./images/image-11.png)'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown), {
    text: markdown,
    selectionOffset: markdown.length,
  })
})

test('prepareImageMarkdownInsertion does not move across an existing following newline', () => {
  const markdown = '![clipboard image](./images/image-11.png)'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown, '\nNext paragraph'), {
    text: markdown,
    selectionOffset: markdown.length,
  })
})

test('prepareImageMarkdownInsertion keeps base64 image markdown unchanged', () => {
  const markdown = '![clipboard image](data:image/png;base64,AQID)'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown), {
    text: markdown,
    selectionOffset: markdown.length,
  })
})

test('prepareImageMarkdownInsertion preserves an existing trailing newline intact', () => {
  const markdown = '![clipboard image](./images/image-11.png)\n'

  assert.deepEqual(prepareImageMarkdownInsertion(markdown, '\nNext paragraph'), {
    text: markdown,
    selectionOffset: markdown.length,
  })
})
