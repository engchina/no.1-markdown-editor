import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeKatex from 'rehype-katex'
import { sanitizeSchema } from '../../lib/markdownShared.ts'
import { rehypeHighlightMarkers } from '../../lib/rehypeHighlightMarkers.ts'
import { rehypeSuperscriptMarkers } from '../../lib/rehypeSuperscriptMarkers.ts'

const inlineMarkdownCache = new Map<string, string>()

const inlineMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSuperscriptMarkers)
  .use(rehypeHighlightMarkers)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeKatex)
  .use(rehypeStringify)

export function renderInlineMarkdownFragment(markdown: string): string {
  const source = String(markdown ?? '')
  const cached = inlineMarkdownCache.get(source)
  if (cached !== undefined) return cached

  const rendered = String(inlineMarkdownProcessor.processSync(source))
  const normalized = stripSingleParagraphWrapper(rendered)
  inlineMarkdownCache.set(source, normalized)
  return normalized
}

function stripSingleParagraphWrapper(html: string): string {
  const trimmed = html.trim()
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/u)
  return match ? match[1] : trimmed
}
