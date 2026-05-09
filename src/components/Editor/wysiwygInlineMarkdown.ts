import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeKatex from 'rehype-katex'
import { normalizeSelfClosingRawHtmlBlocks, sanitizeSchema } from '../../lib/markdownShared.ts'
import { rehypeHighlightMarkers } from '../../lib/rehypeHighlightMarkers.ts'
import { rehypeHardenRawHtml, rehypePrepareRawHtmlForSanitize } from '../../lib/rehypeHardenRawHtml.ts'
import { rehypeNormalizeImageSources } from '../../lib/rehypeNormalizeImageSources.ts'
import { rehypeSubscriptMarkers } from '../../lib/rehypeSubscriptMarkers.ts'
import { rehypeSuperscriptMarkers } from '../../lib/rehypeSuperscriptMarkers.ts'
import { buildReferenceAwareMarkdownSource } from './wysiwygReferenceLinks.ts'

const inlineMarkdownCache = new Map<string, Map<string, string>>()
const inlineMarkdownWithTableBreakMarkersCache = new Map<string, Map<string, string>>()

interface RenderInlineMarkdownFragmentOptions {
  tableLineBreakMode?: 'render' | 'placeholder'
  referenceDefinitionsMarkdown?: string
}

const inlineMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSubscriptMarkers)
  .use(rehypeSuperscriptMarkers)
  .use(rehypeHighlightMarkers)
  .use(rehypeNormalizeImageSources)
  .use(rehypePrepareRawHtmlForSanitize)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHardenRawHtml)
  .use(rehypeKatex)
  .use(rehypeStringify)

export function renderInlineMarkdownFragment(
  markdown: string,
  options: RenderInlineMarkdownFragmentOptions = {}
): string {
  const source = String(markdown ?? '')
  const referenceDefinitionsMarkdown = String(options.referenceDefinitionsMarkdown ?? '').trim()
  const cache = options.tableLineBreakMode === 'placeholder'
    ? inlineMarkdownWithTableBreakMarkersCache
    : inlineMarkdownCache
  const cacheBucket = getInlineMarkdownCacheBucket(cache, referenceDefinitionsMarkdown)
  const cached = cacheBucket.get(source)
  if (cached !== undefined) return cached

  const rendered = String(
    inlineMarkdownProcessor.processSync(
      buildReferenceAwareMarkdownSource(normalizeSelfClosingRawHtmlBlocks(source), referenceDefinitionsMarkdown)
    )
  )
  const normalized = stripSingleParagraphWrapper(rendered)
  const finalized = options.tableLineBreakMode === 'placeholder'
    ? replaceInlineBreaksWithTableMarkers(normalized)
    : normalized
  cacheBucket.set(source, finalized)
  return finalized
}

function getInlineMarkdownCacheBucket(
  cache: Map<string, Map<string, string>>,
  referenceDefinitionsMarkdown: string
): Map<string, string> {
  let cacheBucket = cache.get(referenceDefinitionsMarkdown)
  if (!cacheBucket) {
    cacheBucket = new Map<string, string>()
    cache.set(referenceDefinitionsMarkdown, cacheBucket)
  }

  return cacheBucket
}

function stripSingleParagraphWrapper(html: string): string {
  const trimmed = html.trim()
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/u)
  if (!match) return trimmed

  return /<\/p>\s*<p\b/iu.test(match[1]) ? trimmed : match[1]
}

function replaceInlineBreaksWithTableMarkers(html: string): string {
  return html.replace(
    /<br\s*\/?>/gu,
    '<span class="cm-wysiwyg-table__line-break-marker">&lt;br /&gt;</span>'
  )
}
