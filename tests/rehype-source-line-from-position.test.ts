import assert from 'node:assert/strict'
import test from 'node:test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import { remarkSourceLine } from '../src/lib/remarkSourceLine.ts'
import { rehypeSourceLineFromPosition } from '../src/lib/rehypeSourceLineFromPosition.ts'

async function renderWithRaw(markdown: string): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkSourceLine)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSourceLineFromPosition)
      .use(rehypeStringify)
      .process(markdown)
  )
}

test('rehypeSourceLineFromPosition fills inner raw HTML elements', async () => {
  const markdown = [
    'paragraph line 1',
    '',
    '<div class="raw">',
    '  <p>raw inner line 4</p>',
    '  <ul>',
    '    <li>raw item line 6</li>',
    '  </ul>',
    '</div>',
    '',
    'after',
  ].join('\n')

  const html = await renderWithRaw(markdown)

  assert.match(html, /<p data-source-line="1">paragraph line 1<\/p>/)
  assert.match(html, /<div class="raw" data-source-line="3">/)
  assert.match(html, /<p data-source-line="4">/)
  assert.match(html, /<ul data-source-line="5">/)
  assert.match(html, /<li data-source-line="6">/)
})

test('rehypeSourceLineFromPosition does not overwrite an existing dataSourceLine', async () => {
  const markdown = ['outer paragraph line 1', '', 'after line 3'].join('\n')

  const html = await renderWithRaw(markdown)

  // Each element should have exactly one data-source-line attr (no duplicates)
  for (const tag of html.match(/<[a-z][^>]*data-source-line[^>]*>/gi) ?? []) {
    const occurrences = (tag.match(/data-source-line=/g) ?? []).length
    assert.equal(occurrences, 1, `duplicate attribute in ${tag}`)
  }
})
