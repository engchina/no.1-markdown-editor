import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { finalizeRenderedMarkdownHtml, normalizeSelfClosingRawHtmlBlocks, sanitizeSchema, stripFrontMatter } from './markdownShared.ts'
import { rehypeHeadingIds } from './rehypeHeadingIds.ts'
import { rehypeHighlightMarkers } from './rehypeHighlightMarkers.ts'
import { rehypeNormalizeImageSources } from './rehypeNormalizeImageSources.ts'
import { rehypeHardenRawHtml, rehypePrepareRawHtmlForSanitize } from './rehypeHardenRawHtml.ts'
import { rehypeSplitHtmlBreakOrderedLists } from './rehypeSplitHtmlBreakOrderedLists.ts'
import {
  applyMarkdownSyntaxHighlighting,
  type MarkdownSyntaxHighlightEngine,
} from './markdownSyntaxHighlight.ts'
import { rehypeSubscriptMarkers } from './rehypeSubscriptMarkers.ts'
import { rehypeSuperscriptMarkers } from './rehypeSuperscriptMarkers.ts'

const processors: Partial<Record<MarkdownSyntaxHighlightEngine, Promise<any>>> = {}

async function getProcessorWithHtml(engine: MarkdownSyntaxHighlightEngine) {
  if (processors[engine]) return processors[engine]

  processors[engine] = (async () => {
    let processor: any = unified()
      .use(remarkParse)
      .use(remarkGfm, { singleTilde: false })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSplitHtmlBreakOrderedLists)
      .use(rehypeSubscriptMarkers)
      .use(rehypeSuperscriptMarkers)
      .use(rehypeHighlightMarkers)
      .use(rehypeNormalizeImageSources)
      .use(rehypePrepareRawHtmlForSanitize)
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeHardenRawHtml)

    processor = await applyMarkdownSyntaxHighlighting(processor, engine)

    return processor
      .use(rehypeHeadingIds)
      .use(rehypeStringify)
  })().catch((error) => {
    delete processors[engine]
    throw error
  })

  return processors[engine]
}

export async function renderMarkdownWithHtml(
  markdown: string,
  syntaxHighlightEngine: MarkdownSyntaxHighlightEngine = 'highlightjs'
): Promise<string> {
  const { meta, body } = stripFrontMatter(markdown)
  const normalizedBody = normalizeSelfClosingRawHtmlBlocks(body)
  const processor = await getProcessorWithHtml(syntaxHighlightEngine)
  const rendered = await processor.process({
    value: normalizedBody,
    data: { markdownSource: normalizedBody },
  })
  return finalizeRenderedMarkdownHtml(meta, String(rendered))
}
