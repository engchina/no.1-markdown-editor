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

test('buildWebClipMarkdown uses readable markdown instead of raw page text when both exist', () => {
  const md = buildWebClipMarkdown({
    ...snapshot,
    text: '<html><body><script>window.secret = true</script><article>Raw page implementation</article></body></html>',
    markdown: '## Readable Article\n\nFormatted page content.',
  })

  assert.match(md, /## Readable Article/)
  assert.doesNotMatch(md, /<script>/)
  assert.doesNotMatch(md, /Raw page implementation/)
})

test('buildWebClipMarkdown does not fall back to implementation script dumps', () => {
  const scriptDump = '(function(){function d(a,b){document.addEventListener("visibilitychange",b);Object.defineProperty(window,"x",{value:1});google.ia.rf.push(a);};'.repeat(10)
  const md = buildWebClipMarkdown({
    ...snapshot,
    text: scriptDump,
    markdown: '',
  })

  assert.match(md, /## Example Post/)
  assert.doesNotMatch(md, /Object\.defineProperty/)
  assert.doesNotMatch(md, /google\.ia/)
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
  assert.match(attachment.content, /Content format: Markdown/)
  assert.equal(attachment.truncated, false)
})

test('buildWebpageAttachment includes extraction diagnostics as metadata for AI', () => {
  const attachment = buildWebpageAttachment({
    ...snapshot,
    extraction: {
      requestedMode: 'auto',
      mode: 'article',
      root: 'article.markdown-body',
      source: 'readability-article',
      contentLength: 2400,
      markdownLength: 1800,
      articleCandidates: 5,
      articleCards: 0,
      filteredElements: 7,
    },
  })

  assert.match(attachment.content, /Extraction mode: article/)
  assert.match(attachment.content, /Source: readability-article/)
  assert.match(attachment.content, /Root: article\.markdown-body/)
  assert.match(attachment.content, /Filtered elements: 7/)
})

test('buildWebpageAttachment passes markdown content to AI instead of raw page text', () => {
  const attachment = buildWebpageAttachment({
    ...snapshot,
    text: '<html><body><script>window.secret = true</script><article>Raw page implementation</article></body></html>',
    markdown: '## Readable Article\n\nFormatted page content.',
  })

  assert.match(attachment.content, /## Readable Article/)
  assert.match(attachment.content, /Formatted page content/)
  assert.doesNotMatch(attachment.content, /<script>/)
  assert.doesNotMatch(attachment.content, /Raw page implementation/)
})

test('buildWebpageAttachment drops implementation script dumps when no readable markdown exists', () => {
  const scriptDump = '(function(){function d(a,b){document.addEventListener("prerenderingchange",b);Object.defineProperty(globalThis,"x",{value:1});google.ia.rf.push(a);};'.repeat(10)
  const attachment = buildWebpageAttachment({
    ...snapshot,
    text: scriptDump,
    markdown: '',
  })

  assert.match(attachment.content, /Content format: Markdown/)
  assert.doesNotMatch(attachment.content, /Object\.defineProperty/)
  assert.doesNotMatch(attachment.content, /google\.ia/)
})

test('buildWebpageAttachment truncates very long content', () => {
  const long = 'a'.repeat(20000)
  const attachment = buildWebpageAttachment({ ...snapshot, text: long, markdown: '' })
  assert.equal(attachment.truncated, true)
  assert.ok(attachment.content.length < long.length + 200)
})
