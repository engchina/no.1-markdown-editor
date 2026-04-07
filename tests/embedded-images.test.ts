import assert from 'node:assert/strict'
import test from 'node:test'
import { materializeEmbeddedMarkdownImages } from '../src/lib/embeddedImages.ts'

test('materializeEmbeddedMarkdownImages leaves markdown unchanged when no embedded images exist', async () => {
  const markdown = 'Plain text only'
  const persisted: string[] = []

  const result = await materializeEmbeddedMarkdownImages(markdown, {
    persistImage: async (fileName) => {
      persisted.push(fileName)
    },
    batchId: 123,
  })

  assert.equal(result, markdown)
  assert.deepEqual(persisted, [])
})

test('materializeEmbeddedMarkdownImages saves base64 markdown images into the sibling images directory', async () => {
  const persisted = new Map<string, Uint8Array>()
  const markdown = [
    '# Draft',
    '',
    '![clipboard image](data:image/png;base64,AQID)',
    '',
    '[![wrapped](data:image/jpeg;base64,BAUG)](https://example.com)',
  ].join('\n')

  const result = await materializeEmbeddedMarkdownImages(markdown, {
    batchId: 1700000000000,
    persistImage: async (fileName, bytes) => {
      persisted.set(fileName, bytes)
    },
  })

  assert.equal(
    result,
    [
      '# Draft',
      '',
      '![clipboard image](./images/image-1700000000000.png)',
      '',
      '[![wrapped](./images/image-1700000000000-2.jpg)](https://example.com)',
    ].join('\n')
  )
  assert.deepEqual([...persisted.keys()], ['image-1700000000000.png', 'image-1700000000000-2.jpg'])
  assert.deepEqual(Array.from(persisted.get('image-1700000000000.png') ?? []), [1, 2, 3])
  assert.deepEqual(Array.from(persisted.get('image-1700000000000-2.jpg') ?? []), [4, 5, 6])
})

test('materializeEmbeddedMarkdownImages preserves image titles when rewriting embedded images', async () => {
  const markdown = '![chart](data:image/webp;base64,AQID "Preview")'

  const result = await materializeEmbeddedMarkdownImages(markdown, {
    batchId: 5,
    persistImage: async () => {},
  })

  assert.equal(result, '![chart](./images/image-5.webp "Preview")')
})
