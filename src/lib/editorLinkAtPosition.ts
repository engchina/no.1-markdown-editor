// Detect a clickable link at a document position inside a Markdown source line.
//
// Used by the editor's Ctrl/Cmd+Click handler to follow links from both Source and
// WYSIWYG modes. Recognized forms:
//   - [text](url) and [text](url "title")
//   - <url> autolinks (http(s), mailto, tel)
//   - <a href="url">text</a> HTML anchors
//   - Bare URLs: http(s)://..., mailto:..., tel:...
//
// Reference-style links ([text][label]) intentionally skipped — resolving them
// requires the document's reference definition table, which the click handler
// does not currently plumb through. Falling back to "no link" is safe (cursor
// goes where the user clicked).

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export interface DetectedEditorLink {
  url: string
  label: string
  from: number
  to: number
}

interface LineLinkCandidate {
  rawHref: string
  from: number
  to: number
}

export function findEditorLinkAtLinePosition(
  lineText: string,
  lineOffset: number
): DetectedEditorLink | null {
  for (const candidate of iterateLineLinkCandidates(lineText)) {
    if (lineOffset < candidate.from || lineOffset >= candidate.to) continue
    const resolved = resolveExternalLink(candidate.rawHref)
    if (resolved) {
      return { url: resolved.url, label: resolved.label, from: candidate.from, to: candidate.to }
    }
  }

  return null
}

function* iterateLineLinkCandidates(text: string): Generator<LineLinkCandidate> {
  yield* iterateMarkdownInlineLinks(text)
  yield* iterateAngleBracketAutolinks(text)
  yield* iterateHtmlAnchorLinks(text)
  yield* iterateBareUrlLinks(text)
}

// [text](url) and [text](url "title"). Skips images (![alt](url)).
function* iterateMarkdownInlineLinks(text: string): Generator<LineLinkCandidate> {
  const pattern = /(!?)\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+"[^"\n]*")?\s*\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match[1] === '!') continue
    const rawHref = match[3].startsWith('<') && match[3].endsWith('>')
      ? match[3].slice(1, -1)
      : match[3]
    yield { rawHref, from: match.index, to: match.index + match[0].length }
  }
}

// <https://example.com>, <mailto:a@b>, <tel:+1>.
function* iterateAngleBracketAutolinks(text: string): Generator<LineLinkCandidate> {
  const pattern = /<((?:https?:|mailto:|tel:)[^>\s]+)>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    yield { rawHref: match[1], from: match.index, to: match.index + match[0].length }
  }
}

// <a href="url">text</a> — match the entire anchor span so clicking the label works too.
function* iterateHtmlAnchorLinks(text: string): Generator<LineLinkCandidate> {
  const pattern = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const rawHref = match[1] ?? match[2] ?? ''
    yield { rawHref, from: match.index, to: match.index + match[0].length }
  }
}

// Bare URLs in body text (GFM autolinks).
function* iterateBareUrlLinks(text: string): Generator<LineLinkCandidate> {
  const pattern = /(?:https?:\/\/|mailto:|tel:)[^\s<>"'`)]+/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    // Skip if this URL is already inside a markdown link "(...)" or angle brackets;
    // those are emitted by the earlier passes with the correct outer span.
    if (isInsideEnclosingPair(text, match.index)) continue
    const trimmedEnd = trimTrailingPunctuation(match[0])
    yield {
      rawHref: trimmedEnd,
      from: match.index,
      to: match.index + trimmedEnd.length,
    }
  }
}

function isInsideEnclosingPair(text: string, index: number): boolean {
  const prev = text[index - 1]
  return prev === '<' || prev === '('
}

function trimTrailingPunctuation(raw: string): string {
  // URLs in prose often end with sentence punctuation that isn't part of the URL.
  let end = raw.length
  while (end > 0 && /[.,;:!?)\]]/.test(raw[end - 1])) end -= 1
  return raw.slice(0, end)
}

function resolveExternalLink(rawHref: string): { url: string; label: string } | null {
  const trimmed = rawHref.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  const looksExternal =
    /^https?:\/\//i.test(trimmed) ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  if (!looksExternal) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null

  return {
    url: parsed.toString(),
    label: getLinkLabel(parsed),
  }
}

function getLinkLabel(url: URL): string {
  switch (url.protocol) {
    case 'mailto:':
    case 'tel:':
      return decodeURIComponent(url.pathname || url.href)
    default:
      return url.host || url.href
  }
}
