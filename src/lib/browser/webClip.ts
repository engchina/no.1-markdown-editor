import type { PageSnapshot } from './agentBridge.ts'
import type { AIExplicitContextAttachment } from '../ai/types.ts'

/**
 * Turn a captured browser page into Markdown destined for the editor, and into
 * an AI context attachment. These are pure helpers so they can be unit-tested
 * without a Tauri host or the Zustand store.
 */

/** Cap web-clip body length so a huge page can't blow up a note. */
const MAX_CLIP_BODY_CHARS = 100000
/** Cap the content we hand to the model as context. */
const MAX_WEBPAGE_CONTEXT_CHARS = 12000

function cleanTitle(snapshot: Pick<PageSnapshot, 'title' | 'url'>): string {
  const title = snapshot.title.trim()
  if (title) return title
  try {
    return new URL(snapshot.url).hostname.replace(/^www\./, '')
  } catch {
    return snapshot.url || 'Untitled page'
  }
}

function looksLikeImplementationDump(source: string): boolean {
  const value = source.replace(/\s+/g, ' ').trim()
  if (value.length < 240) return false
  const signals = [
    /\(?function\s*\(|=>\s*\{/u,
    /\bdocument\.(addEventListener|getElementById|querySelector|prerendering|hidden)\b/u,
    /\bObject\.defineProperty\b|\bArray\.prototype\.values\b/u,
    /\bwindow\b|\bglobalThis\b|\bSymbol\.iterator\b/u,
    /\bgoogle\.[a-z0-9_.]+\b/iu,
  ].filter((pattern) => pattern.test(value)).length
  const punctuation = value.match(/[{};=]/gu)?.length ?? 0
  return signals >= 2 || (signals >= 1 && punctuation / value.length > 0.08)
}

function readablePageMarkdown(snapshot: PageSnapshot, maxChars?: number): string {
  const markdown = snapshot.markdown.trim()
  const text = snapshot.text.trim()
  const source = markdown || (looksLikeImplementationDump(text) ? '' : text)
  return typeof maxChars === 'number' ? source.slice(0, maxChars) : source
}

function extractionSummary(snapshot: PageSnapshot): string {
  const extraction = snapshot.extraction
  if (!extraction) return ''
  const mode = extraction.mode === 'fallback' ? 'fallback' : extraction.mode
  const requested = extraction.requestedMode === mode ? mode : `${mode} from ${extraction.requestedMode}`
  const details = [
    `Extraction mode: ${requested}`,
    extraction.source ? `Source: ${extraction.source}` : '',
    extraction.root ? `Root: ${extraction.root}` : '',
    `Markdown chars: ${extraction.markdownLength}`,
    extraction.articleCards ? `Article cards: ${extraction.articleCards}` : '',
    extraction.filteredElements ? `Filtered elements: ${extraction.filteredElements}` : '',
  ].filter(Boolean)
  return details.join('\n')
}

/**
 * Build the Markdown inserted into a note when clipping a page. Always leads
 * with a heading and a blockquote source attribution so the provenance is
 * visible in the document itself (independent of editor provenance marks).
 */
export function buildWebClipMarkdown(snapshot: PageSnapshot): string {
  const title = cleanTitle(snapshot)
  const url = snapshot.url.trim()
  const body = readablePageMarkdown(snapshot, MAX_CLIP_BODY_CHARS)

  const lines: string[] = []
  lines.push(`## ${title}`)
  lines.push('')
  if (url) {
    lines.push(`> 来源 / Source: [${title}](${url})`)
    lines.push('')
  }
  if (body) {
    lines.push(body)
  }
  return lines.join('\n').trimEnd() + '\n'
}

/**
 * Insert clip Markdown into existing document text at the end, separated by a
 * blank line. Returns the new full document text. Kept pure for testability;
 * callers persist via the editor store's `updateTabContent`.
 */
export function appendWebClipToDocument(documentText: string, clipMarkdown: string): string {
  const base = documentText.replace(/\s+$/u, '')
  const clip = clipMarkdown.trim()
  if (!base) return `${clip}\n`
  return `${base}\n\n${clip}\n`
}

/**
 * Build an AI context attachment from a captured page, used by "ask about this
 * page". `detail` carries the source URL so it surfaces in the context chip and
 * provenance; `content` is the same readable Markdown body used by Clip.
 */
export function buildWebpageAttachment(snapshot: PageSnapshot): AIExplicitContextAttachment {
  const title = cleanTitle(snapshot)
  const source = readablePageMarkdown(snapshot)
  const truncated = source.length > MAX_WEBPAGE_CONTEXT_CHARS
  const content = truncated ? source.slice(0, MAX_WEBPAGE_CONTEXT_CHARS) : source
  const extraction = extractionSummary(snapshot)
  return {
    id: `webpage:${snapshot.url}`,
    kind: 'webpage',
    label: title,
    detail: snapshot.url,
    content: `Webpage: ${title}\nURL: ${snapshot.url}\nContent format: Markdown${extraction ? `\n${extraction}` : ''}\n\n${content}`,
    truncated,
  }
}
