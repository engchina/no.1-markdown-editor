import assert from 'node:assert/strict'
import test from 'node:test'
import {
  persistDraftImageFilesAsMarkdown,
  persistImageFilesAsMarkdown,
  saveMarkdownDocumentWithAssets,
  type FilePersistence,
  type PersistableImageFile,
} from '../src/lib/documentPersistence.ts'

function createPersistenceRecorder(): {
  persistence: FilePersistence
  copiedFiles: Array<[string, string]>
  textWrites: Map<string, string>
  binaryWrites: Map<string, number[]>
} {
  const copiedFiles: Array<[string, string]> = []
  const textWrites = new Map<string, string>()
  const binaryWrites = new Map<string, number[]>()
  const appConfigPath = '/Users/test/Library/Application Support/com.no1.markdown-editor'

  return {
    persistence: {
      appConfigDir: async () => appConfigPath,
      dirname: async (path) => path.slice(0, path.lastIndexOf('/')),
      join: async (...paths) => paths.filter(Boolean).join('/').replace(/\/+/g, '/'),
      copyFile: async (sourcePath, destinationPath) => {
        copiedFiles.push([sourcePath, destinationPath])
      },
      writeTextFile: async (path, content) => {
        textWrites.set(path, content)
      },
      writeBinaryFile: async (path, bytes) => {
        binaryWrites.set(path, Array.from(bytes))
      },
    },
    copiedFiles,
    textWrites,
    binaryWrites,
  }
}

function createImageFile(name: string, type: string, bytes: number[]): PersistableImageFile {
  return {
    name,
    type,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  }
}

test('saveMarkdownDocumentWithAssets writes sibling image assets outside plugin-fs scope', async () => {
  const { persistence, textWrites, binaryWrites } = createPersistenceRecorder()
  const markdown = [
    '# Draft',
    '',
    '![clipboard image](data:image/png;base64,AQID)',
  ].join('\n')

  const result = await saveMarkdownDocumentWithAssets(markdown, '/docs/post.md', persistence, {
    batchId: 7,
  })

  assert.equal(
    result,
    [
      '# Draft',
      '',
      '![clipboard image](./images/image-7.png)',
    ].join('\n')
  )
  assert.equal(textWrites.get('/docs/post.md'), result)
  assert.deepEqual([...binaryWrites.entries()], [['/docs/images/image-7.png', [1, 2, 3]]])
})

test('persistImageFilesAsMarkdown stores pasted images beside the active document', async () => {
  const { persistence, binaryWrites } = createPersistenceRecorder()
  const markdown = await persistImageFilesAsMarkdown(
    [
      createImageFile('hero-image_v2.png', 'image/png', [1, 2, 3]),
      createImageFile('diagram', 'image/webp', [4, 5, 6]),
    ],
    '/docs/post.md',
    persistence,
    { batchId: 11 }
  )

  assert.equal(
    markdown,
    [
      '![hero image v2](./images/image-11-1.png)',
      '![diagram](./images/image-11-2.webp)',
    ].join('\n')
  )
  assert.deepEqual(
    [...binaryWrites.entries()],
    [
      ['/docs/images/image-11-1.png', [1, 2, 3]],
      ['/docs/images/image-11-2.webp', [4, 5, 6]],
    ]
  )
})

test('persistDraftImageFilesAsMarkdown stores unsaved images in the app config draft image directory', async () => {
  const { persistence, binaryWrites } = createPersistenceRecorder()
  const markdown = await persistDraftImageFilesAsMarkdown(
    [createImageFile('hero-image_v2.png', 'image/png', [1, 2, 3])],
    'tab-1',
    persistence,
    { batchId: 17 }
  )

  assert.equal(
    markdown,
    '![hero image v2](</Users/test/Library/Application Support/com.no1.markdown-editor/draft-images/tab-1/image-17.png>)'
  )
  assert.deepEqual(
    [...binaryWrites.entries()],
    [[
      '/Users/test/Library/Application Support/com.no1.markdown-editor/draft-images/tab-1/image-17.png',
      [1, 2, 3],
    ]]
  )
})

test('saveMarkdownDocumentWithAssets copies draft images into the sibling images directory on save', async () => {
  const { persistence, copiedFiles, textWrites } = createPersistenceRecorder()
  const markdown = [
    '# Draft',
    '',
    '![clipboard image](</Users/test/Library/Application Support/com.no1.markdown-editor/draft-images/tab-1/image-17.png>)',
  ].join('\n')

  const result = await saveMarkdownDocumentWithAssets(markdown, '/docs/post.md', persistence, {
    batchId: 21,
  })

  assert.equal(
    result,
    [
      '# Draft',
      '',
      '![clipboard image](./images/image-22.png)',
    ].join('\n')
  )
  assert.equal(textWrites.get('/docs/post.md'), result)
  assert.deepEqual(copiedFiles, [[
    '/Users/test/Library/Application Support/com.no1.markdown-editor/draft-images/tab-1/image-17.png',
    '/docs/images/image-22.png',
  ]])
})
