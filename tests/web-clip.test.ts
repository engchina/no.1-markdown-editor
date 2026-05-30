import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendWebClipToDocument,
  buildWebClipMarkdown,
  buildWebpageAttachment,
} from '../src/lib/browser/webClip.ts'
import type { PageSnapshot } from '../src/lib/browser/agentBridge.ts'

const snapshot: PageSnapshot = {
  url: 'https://example.com/post',
  title: 'Example Post',
  text: 'Hello world body text',
  markdown: '# Hello\n\nworld body',
  elements: [],
}

test('buildWebClipMarkdown leads with heading and source attribution', () => {
  const md = buildWebClipMarkdown(snapshot)
  assert.match(md, /^## Example Post/)
  assert.match(md, /\[Example Post\]\(https:\/\/example\.com\/post\)/)
  assert.match(md, /world body/)
})

test('buildWebClipMarkdown falls back to hostname when title is empty', () => {
  const md = buildWebClipMarkdown({ ...snapshot, title: '' })
  assert.match(md, /^## example\.com/)
})

test('buildWebClipMarkdown prefers markdown but falls back to text', () => {
  const md = buildWebClipMarkdown({ ...snapshot, markdown: '' })
  assert.match(md, /Hello world body text/)
})

test('appendWebClipToDocument appends with a blank-line separator', () => {
  const result = appendWebClipToDocument('# Notes\n\nexisting', '## Clip\n\nbody\n')
  assert.equal(result, '# Notes\n\nexisting\n\n## Clip\n\nbody\n')
})

test('appendWebClipToDocument handles an empty document', () => {
  const result = appendWebClipToDocument('', '## Clip\n\nbody\n')
  assert.equal(result, '## Clip\n\nbody\n')
})

test('buildWebpageAttachment carries url in detail and labels with title', () => {
  const attachment = buildWebpageAttachment(snapshot)
  assert.equal(attachment.kind, 'webpage')
  assert.equal(attachment.label, 'Example Post')
  assert.equal(attachment.detail, 'https://example.com/post')
  assert.match(attachment.content, /URL: https:\/\/example\.com\/post/)
  assert.equal(attachment.truncated, false)
})

test('buildWebpageAttachment truncates very long content', () => {
  const long = 'a'.repeat(20000)
  const attachment = buildWebpageAttachment({ ...snapshot, text: long, markdown: '' })
  assert.equal(attachment.truncated, true)
  assert.ok(attachment.content.length < long.length + 200)
})
