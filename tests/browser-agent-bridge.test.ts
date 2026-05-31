import assert from 'node:assert/strict'
import test from 'node:test'
import {
  makeRequestId,
  normalizeBrowserExtractionMode,
  parseSnapshot,
} from '../src/lib/browser/agentBridge.ts'

test('makeRequestId produces an alphanumeric id within the Rust length cap', () => {
  for (let i = 0; i < 200; i++) {
    const id = makeRequestId()
    // Must match is_safe_request_id in src-tauri/src/lib.rs:
    // non-empty, <= 64 chars, ASCII alphanumeric only.
    assert.ok(id.length > 0, 'id should be non-empty')
    assert.ok(id.length <= 64, `id should be <= 64 chars, got ${id.length}`)
    assert.match(id, /^[a-zA-Z0-9]+$/, `id should be alphanumeric, got "${id}"`)
  }
})

test('makeRequestId returns reasonably unique ids', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 500; i++) seen.add(makeRequestId())
  // Allow a tiny collision margin but expect near-total uniqueness.
  assert.ok(seen.size > 480, `expected mostly-unique ids, got ${seen.size}/500`)
})

test('parseSnapshot normalizes a complete payload', () => {
  const raw = JSON.stringify({
    url: 'https://example.com/post',
    title: 'Example Post',
    text: 'Hello world',
    markdown: '# Hello\n\nworld',
    extraction: {
      requestedMode: 'auto',
      mode: 'article',
      root: 'article.post',
      source: 'readability-article',
      contentLength: 11,
      markdownLength: 14,
      articleCandidates: 4,
      articleCards: 0,
      filteredElements: 3,
    },
    elements: [
      { idx: 0, role: 'link', name: 'Home' },
      { idx: 1, role: 'button', name: 'Subscribe' },
    ],
  })
  const snapshot = parseSnapshot(raw)
  assert.equal(snapshot.url, 'https://example.com/post')
  assert.equal(snapshot.title, 'Example Post')
  assert.equal(snapshot.markdown, '# Hello\n\nworld')
  assert.equal(snapshot.extraction?.mode, 'article')
  assert.equal(snapshot.extraction?.source, 'readability-article')
  assert.equal(snapshot.extraction?.filteredElements, 3)
  assert.equal(snapshot.elements.length, 2)
  assert.equal(snapshot.elements[1].role, 'button')
  assert.equal(snapshot.error, undefined)
})

test('parseSnapshot fills defaults for missing/invalid fields', () => {
  const snapshot = parseSnapshot(JSON.stringify({ url: 'https://x.test' }))
  assert.equal(snapshot.url, 'https://x.test')
  assert.equal(snapshot.title, '')
  assert.equal(snapshot.text, '')
  assert.equal(snapshot.markdown, '')
  assert.equal(snapshot.extraction, undefined)
  assert.deepEqual(snapshot.elements, [])
})

test('parseSnapshot surfaces a bridge-side error field', () => {
  const snapshot = parseSnapshot(
    JSON.stringify({ url: 'https://x.test', error: 'boom' }),
  )
  assert.equal(snapshot.error, 'boom')
})

test('parseSnapshot ignores a non-array elements field', () => {
  const snapshot = parseSnapshot(JSON.stringify({ elements: 'nope' }))
  assert.deepEqual(snapshot.elements, [])
})

test('normalizeBrowserExtractionMode accepts only supported capture modes', () => {
  assert.equal(normalizeBrowserExtractionMode('auto'), 'auto')
  assert.equal(normalizeBrowserExtractionMode('article'), 'article')
  assert.equal(normalizeBrowserExtractionMode('selection'), 'selection')
  assert.equal(normalizeBrowserExtractionMode('visible'), 'visible')
  assert.equal(normalizeBrowserExtractionMode('list'), 'list')
  assert.equal(normalizeBrowserExtractionMode('raw-html'), 'auto')
  assert.equal(normalizeBrowserExtractionMode(undefined), 'auto')
})
