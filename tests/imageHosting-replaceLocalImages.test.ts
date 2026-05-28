import assert from 'node:assert/strict'
import test from 'node:test'
import { replaceLocalImagesWithRemoteUrls } from '../src/lib/imageHosting/replaceLocalImages.ts'
import { resolveAbsoluteLocalPath } from '../src/lib/imageHosting/runUpload.ts'

const FIXED_NOW = new Date(Date.UTC(2026, 4, 28, 0, 0, 0))

test('replaces local image refs with remote URLs and keeps alt + title', async () => {
  const markdown = [
    '# Title',
    '',
    '![one](./image/1.png "title one")',
    '![two](image/2.JPG)',
    '![remote](https://example.com/x.png)',
    '![doc](./not-image.txt)',
    '',
    'End.',
  ].join('\n')

  const uploads: Array<{ localPath: string; remoteFilename: string }> = []

  const report = await replaceLocalImagesWithRemoteUrls({
    markdown,
    documentPath: '/workspace/notes/article.md',
    documentName: 'article.md',
    batchId: 1700,
    now: FIXED_NOW,
    resolveLocalPath: (raw, docPath) => resolveAbsoluteLocalPath(raw, docPath),
    uploader: async ({ localPath, remoteFilename }) => {
      uploads.push({ localPath, remoteFilename })
      return { url: `https://cdn.example.com/${remoteFilename}` }
    },
  })

  assert.equal(report.uploaded.length, 2)
  assert.equal(report.failed.length, 0)
  assert.equal(
    report.skipped.filter((entry) => entry.reason === 'remote').length,
    1,
    'remote image must be skipped'
  )
  assert.equal(
    report.skipped.filter((entry) => entry.reason === 'unsupported').length,
    1,
    'non-image file must be skipped'
  )

  assert.equal(uploads[0].localPath, '/workspace/notes/image/1.png')
  assert.equal(uploads[1].localPath, '/workspace/notes/image/2.JPG')

  assert.match(report.rewrittenMarkdown, /!\[one\]\(https:\/\/cdn\.example\.com\/[^)]+ "title one"\)/)
  assert.match(report.rewrittenMarkdown, /!\[two\]\(https:\/\/cdn\.example\.com\/[^)]+\)/)
  assert.match(report.rewrittenMarkdown, /!\[remote\]\(https:\/\/example\.com\/x\.png\)/)
  assert.match(report.rewrittenMarkdown, /!\[doc\]\(\.\/not-image\.txt\)/)
})

test('records failure without rewriting the matching image', async () => {
  const markdown = '![ok](./a.png)\n![bad](./b.png)\n'

  const report = await replaceLocalImagesWithRemoteUrls({
    markdown,
    documentPath: '/x/y.md',
    documentName: 'y.md',
    now: FIXED_NOW,
    resolveLocalPath: (raw, docPath) => resolveAbsoluteLocalPath(raw, docPath),
    uploader: async ({ localPath }) => {
      if (localPath.endsWith('b.png')) throw new Error('boom')
      return { url: 'https://cdn.example.com/ok.png' }
    },
  })

  assert.equal(report.uploaded.length, 1)
  assert.equal(report.failed.length, 1)
  assert.match(report.rewrittenMarkdown, /!\[ok\]\(https:\/\/cdn\.example\.com\/ok\.png\)/)
  assert.match(report.rewrittenMarkdown, /!\[bad\]\(\.\/b\.png\)/, 'failed image stays untouched')
})

test('returns markdown unchanged when no images match', async () => {
  const markdown = '# only text\n\nno images here.\n'
  const report = await replaceLocalImagesWithRemoteUrls({
    markdown,
    documentPath: '/x/y.md',
    documentName: 'y.md',
    resolveLocalPath: () => null,
    uploader: async () => {
      throw new Error('should not be called')
    },
  })

  assert.equal(report.uploaded.length, 0)
  assert.equal(report.failed.length, 0)
  assert.equal(report.rewrittenMarkdown, markdown)
})

test('resolveAbsoluteLocalPath handles relative, parent, and absolute paths', () => {
  assert.equal(
    resolveAbsoluteLocalPath('./image/1.png', '/workspace/notes/article.md'),
    '/workspace/notes/image/1.png'
  )
  assert.equal(
    resolveAbsoluteLocalPath('../assets/x.jpg', '/workspace/notes/article.md'),
    '/workspace/assets/x.jpg'
  )
  assert.equal(
    resolveAbsoluteLocalPath('/abs/img.png', '/whatever.md'),
    '/abs/img.png'
  )
  assert.equal(
    resolveAbsoluteLocalPath('C:\\workspace\\img.png', null),
    'C:/workspace/img.png'
  )
  assert.equal(resolveAbsoluteLocalPath('image/1.png', null), null)
  assert.equal(
    resolveAbsoluteLocalPath('./image/1.png?foo=bar#frag', '/x/y.md'),
    '/x/image/1.png'
  )
})
