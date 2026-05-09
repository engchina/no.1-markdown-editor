import assert from 'node:assert/strict'
import test from 'node:test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import { remarkSourceLine } from '../src/lib/remarkSourceLine.ts'
import { rehypeWrapMathPreForSourceLine } from '../src/lib/rehypeWrapMathPreForSourceLine.ts'

async function renderMath(markdown: string): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkSourceLine)
      .use(remarkRehype)
      .use(rehypeWrapMathPreForSourceLine)
      .use(rehypeKatex)
      .use(rehypeStringify)
      .process(markdown)
  )
}

test('rehypeWrapMathPreForSourceLine wraps block math so data-source-line survives rehype-katex', async () => {
  const markdown = [
    '# title',
    '',
    'before',
    '',
    '$$',
    'x + y',
    '$$',
    '',
    'after',
  ].join('\n')

  const html = await renderMath(markdown)

  // Wrapper exists with data-source-line pointing at the $$ start (line 5)
  assert.match(html, /<div class="math-source-line-wrap" data-source-line="5">/)
  // KaTeX output is inside the wrapper
  assert.match(html, /<div class="math-source-line-wrap" data-source-line="5"><span class="katex-display">/)
  // Original <pre data-source-line="..."> should not also be present (we moved the attr to the wrapper)
  const preMatches = html.match(/<pre[^>]*data-source-line/g) ?? []
  assert.equal(preMatches.length, 0, 'expected <pre data-source-line> to be stripped after wrapping')
})

test('rehypeWrapMathPreForSourceLine ignores non-math <pre> blocks', async () => {
  const markdown = ['```js', 'const x = 1', '```'].join('\n')
  const html = await renderMath(markdown)

  // mdast `code` hProperties attach to <code>, not <pre>; no wrapper is added
  assert.match(html, /<code[^>]*data-source-line="1"/)
  assert.doesNotMatch(html, /math-source-line-wrap/)
})

test('rehypeWrapMathPreForSourceLine leaves inline math alone', async () => {
  const html = await renderMath('inline $a + b$ math')

  // Inline math line info comes from the parent <p data-source-line="1">
  assert.match(html, /<p data-source-line="1">/)
  assert.doesNotMatch(html, /math-source-line-wrap/)
})
