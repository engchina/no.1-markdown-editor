import assert from 'node:assert/strict'
import test from 'node:test'
import { renderMarkdown } from '../src/lib/markdown.ts'
import { renderMarkdownInWorker } from '../src/lib/markdownWorker.ts'

const PLAIN_DOC = [
  '# Heading line 1',
  '',
  'paragraph line 3.',
  '',
  '- item line 5',
  '- item line 6',
  '',
  '```js',
  'const x = 9',
  '```',
  '',
  '> quote line 13',
].join('\n')

const RAW_HTML_DOC = [
  '# Heading line 1',
  '',
  'paragraph line 3.',
  '',
  '<div class="raw">',
  '  <p>raw inner line 6</p>',
  '  <ul>',
  '    <li>raw item line 8</li>',
  '  </ul>',
  '</div>',
  '',
  'after line 12.',
].join('\n')

const MATH_DOC = [
  '# Heading line 1',
  '',
  'before line 3.',
  '',
  '$$',
  'x + y',
  '$$',
  '',
  'after line 9.',
].join('\n')

const MATH_HTML_DOC = [
  '# Heading line 1',
  '',
  'before line 3.',
  '',
  '$$',
  'x + y',
  '$$',
  '',
  '<div class="raw">',
  '  <p>raw inner line 11</p>',
  '</div>',
  '',
  'after line 14.',
].join('\n')

function noDuplicateAttributes(html: string): void {
  const tagsWithAttr = html.match(/<[a-z][^>]*data-source-line[^>]*>/gi) ?? []
  for (const tag of tagsWithAttr) {
    const occurrences = (tag.match(/data-source-line=/g) ?? []).length
    assert.equal(occurrences, 1, `duplicate data-source-line attribute in tag: ${tag}`)
  }
}

test('plain pipeline annotates block elements with data-source-line', async () => {
  const html = await renderMarkdownInWorker(PLAIN_DOC)

  assert.match(html, /<h1[^>]*data-source-line="1"/)
  assert.match(html, /<p[^>]*data-source-line="3"/)
  assert.match(html, /<ul[^>]*data-source-line="5"/)
  assert.match(html, /<li[^>]*data-source-line="5"/)
  assert.match(html, /<li[^>]*data-source-line="6"/)
  // mdast `code` hProperties attach to the inner <code>, not the outer <pre>
  assert.match(html, /<code[^>]*data-source-line="8"/)
  assert.match(html, /<blockquote[^>]*data-source-line="12"/)
  noDuplicateAttributes(html)
})

test('html pipeline annotates raw HTML inner elements', async () => {
  const html = await renderMarkdown(RAW_HTML_DOC)

  assert.match(html, /<h1[^>]*data-source-line="1"/)
  assert.match(html, /<p[^>]*data-source-line="3"/)
  // Outer raw <div> on line 5 (existing hardener strips its class, that's fine)
  assert.match(html, /<div[^>]*data-source-line="5"/)
  // Inner raw <p>: line 6
  assert.match(html, /<p[^>]*data-source-line="6"/)
  // Inner raw <ul>: line 7
  assert.match(html, /<ul[^>]*data-source-line="7"/)
  // Inner raw <li>: line 8
  assert.match(html, /<li[^>]*data-source-line="8"/)
  // Trailing paragraph: line 12
  assert.match(html, /<p[^>]*data-source-line="12"/)
  noDuplicateAttributes(html)
})

test('math pipeline wraps block math with a sourcepos-bearing div', async () => {
  const html = await renderMarkdown(MATH_DOC)

  assert.match(html, /<h1[^>]*data-source-line="1"/)
  assert.match(html, /<p[^>]*data-source-line="3"/)
  assert.match(html, /<div class="math-source-line-wrap" data-source-line="5">/)
  // Wrapper directly precedes a katex-display span
  assert.match(html, /<div class="math-source-line-wrap" data-source-line="5">[^<]*<span class="katex-display"/)
  assert.match(html, /<p[^>]*data-source-line="9"/)
  noDuplicateAttributes(html)
})

test('math+html pipeline annotates math wrapper, raw inner elements, and ordinary blocks', async () => {
  const html = await renderMarkdown(MATH_HTML_DOC)

  assert.match(html, /<h1[^>]*data-source-line="1"/)
  assert.match(html, /<p[^>]*data-source-line="3"/)
  assert.match(html, /<div class="math-source-line-wrap" data-source-line="5">/)
  // Outer raw <div> on line 9 (class stripped by existing hardener)
  assert.match(html, /<div[^>]*data-source-line="9"/)
  assert.match(html, /<p[^>]*data-source-line="10"/)
  // Trailing paragraph on line 13 (the "after line 14" label is just text)
  assert.match(html, /<p[^>]*data-source-line="13"/)
  noDuplicateAttributes(html)
})

test('sanitize allowlist preserves data-source-line through all four pipelines', async () => {
  const docs = [PLAIN_DOC, RAW_HTML_DOC, MATH_DOC, MATH_HTML_DOC]
  for (const doc of docs) {
    const html = await renderMarkdown(doc)
    assert.ok(/data-source-line="1"/.test(html), `expected data-source-line="1" in: ${html.slice(0, 200)}`)
  }
})
