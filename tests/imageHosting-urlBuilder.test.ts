import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRemoteFilename,
  extractImageExtension,
  hasSupportedImageExtension,
  isLocalImageReference,
} from '../src/lib/imageHosting/urlBuilder.ts'

test('isLocalImageReference rejects remote schemes', () => {
  assert.equal(isLocalImageReference('https://example.com/x.png'), false)
  assert.equal(isLocalImageReference('http://example.com/x.png'), false)
  assert.equal(isLocalImageReference('data:image/png;base64,AAA='), false)
  assert.equal(isLocalImageReference('//cdn.example.com/x.png'), false)
  assert.equal(isLocalImageReference('file:///C:/x.png'), false)
})

test('isLocalImageReference accepts relative and bare paths', () => {
  assert.equal(isLocalImageReference('./image/1.png'), true)
  assert.equal(isLocalImageReference('../img.jpg'), true)
  assert.equal(isLocalImageReference('image/1.png'), true)
  assert.equal(isLocalImageReference('/abs/x.png'), true)
})

test('hasSupportedImageExtension matches common image suffixes', () => {
  for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']) {
    assert.equal(hasSupportedImageExtension(`pic.${ext}`), true, ext)
    assert.equal(hasSupportedImageExtension(`pic.${ext.toUpperCase()}`), true, ext)
  }
  assert.equal(hasSupportedImageExtension('pic.txt'), false)
  assert.equal(hasSupportedImageExtension('pic'), false)
})

test('extractImageExtension returns lowercase extension with dot', () => {
  assert.equal(extractImageExtension('Screenshot.PNG'), '.png')
  assert.equal(extractImageExtension('a.b.JPG'), '.jpg')
  assert.equal(extractImageExtension('a.b'), '')
})

test('buildRemoteFilename builds yyyy/mm grouped slugged filename', () => {
  const now = new Date(Date.UTC(2026, 4, 28, 10, 0, 0))
  const name = buildRemoteFilename({
    sourcePath: '/Users/me/notes/image/Screenshot 2026.png',
    documentName: 'My Article',
    batchId: 1716894000,
    index: 3,
    now,
  })
  assert.match(name, /^2026\/05\/screenshot-2026-my-article-1716894000-3\.png$/)
})

test('buildRemoteFilename defaults extension and slug when missing', () => {
  const now = new Date(Date.UTC(2026, 0, 1))
  const name = buildRemoteFilename({
    sourcePath: 'C:/tmp/!!!.gif',
    documentName: null,
    batchId: 42,
    index: 1,
    now,
  })
  assert.match(name, /^2026\/01\/.+-document-42-1\.gif$/)
})
