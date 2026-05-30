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

/**
 * Build the Markdown inserted into a note when clipping a page. Always leads
 * with a heading and a blockquote source attribution so the provenance is
 * visible in the document itself (independent of editor provenance marks).
 */
export function buildWebClipMarkdown(snapshot: PageSnapshot): string {
  const title = cleanTitle(snapshot)
  const url = snapshot.url.trim()
  const body = (snapshot.markdown || snapshot.text || '').trim().slice(0, MAX_CLIP_BODY_CHARS)

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
 * provenance; `content` is the trimmed readable text handed to the model.
 */
export function buildWebpageAttachment(snapshot: PageSnapshot): AIExplicitContextAttachment {
  const title = cleanTitle(snapshot)
  const source = (snapshot.text || snapshot.markdown || '').trim()
  const truncated = source.length > MAX_WEBPAGE_CONTEXT_CHARS
  const content = truncated ? source.slice(0, MAX_WEBPAGE_CONTEXT_CHARS) : source
  return {
    id: `webpage:${snapshot.url}`,
    kind: 'webpage',
    label: title,
    detail: snapshot.url,
    content: `Webpage: ${title}\nURL: ${snapshot.url}\n\n${content}`,
    truncated,
  }
}
