import assert from 'node:assert/strict'
import test from 'node:test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { remarkSourceLine } from '../src/lib/remarkSourceLine.ts'

async function render(markdown: string, withMath = false): Promise<string> {
  const processor = unified().use(remarkParse).use(remarkGfm)
  if (withMath) processor.use(remarkMath)
  return String(
    await processor
      .use(remarkSourceLine)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process(markdown)
  )
}

test('remarkSourceLine annotates headings with their source line', async () => {
  const html = await render('# H1\n\n## H2\n')

  assert.match(html, /<h1 data-source-line="1">H1<\/h1>/)
  assert.match(html, /<h2 data-source-line="3">H2<\/h2>/)
})

test('remarkSourceLine annotates paragraphs, lists, and code blocks', async () => {
  const markdown = ['paragraph one', '', '- item a', '- item b', '', '```', 'code', '```'].join('\n')
  const html = await render(markdown)

  assert.match(html, /<p data-source-line="1">paragraph one<\/p>/)
  assert.match(html, /<ul data-source-line="3">/)
  assert.match(html, /<li data-source-line="3">/)
  assert.match(html, /<li data-source-line="4">/)
  // hProperties from mdast `code` attach to the inner <code>, not the outer <pre>
  assert.match(html, /<code data-source-line="6">/)
})

test('remarkSourceLine annotates blockquotes and tables', async () => {
  const markdown = [
    '> quoted line 1',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
  ].join('\n')
  const html = await render(markdown)

  assert.match(html, /<blockquote data-source-line="1">/)
  assert.match(html, /<table data-source-line="3">/)
})

test('remarkSourceLine annotates block math nodes', async () => {
  const html = await render('$$\nx + y\n$$\n', true)

  // remark-math + remark-rehype produces <pre><code class="language-math math-display">
  assert.match(html, /<pre data-source-line="1">/)
})

test('remarkSourceLine does not duplicate attributes when called twice', async () => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSourceLine)
    .use(remarkSourceLine) // intentionally double-applied
    .use(remarkRehype)
    .use(rehypeStringify)

  const html = String(await processor.process('# H1\n'))
  const matches = html.match(/data-source-line="1"/g) ?? []
  assert.equal(matches.length, 1, 'expected single data-source-line attribute, got: ' + html)
})

test('remarkSourceLine ignores inline nodes', async () => {
  const html = await render('a paragraph with **bold** and *italic*\n')

  // Only the wrapping paragraph should carry the line
  const matches = html.match(/data-source-line="1"/g) ?? []
  assert.equal(matches.length, 1)
})
