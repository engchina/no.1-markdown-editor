export interface TextRange {
  from: number
  to: number
}

export interface FencedCodeBlock extends TextRange {
  openingLineFrom: number
  openingLineTo: number
  closingLineFrom: number | null
  closingLineTo: number | null
  language: string | null
}

interface FenceState {
  from: number
  openingLineTo: number
  markerChar: '`' | '~'
  markerLength: number
  language: string | null
}

const openingFencePattern = /^\s{0,3}(`{3,}|~{3,})(.*)$/
const closingFencePattern = /^\s{0,3}(`{3,}|~{3,})\s*$/

export function collectFencedCodeBlocks(markdown: string): FencedCodeBlock[] {
  const blocks: FencedCodeBlock[] = []
  let activeFence: FenceState | null = null
  let from = 0
  let lastLineTo = 0

  while (from <= markdown.length) {
    let to = markdown.indexOf('\n', from)
    if (to === -1) to = markdown.length

    lastLineTo = to
    const rawText = markdown.slice(from, to)
    const text = rawText.endsWith('\r') ? rawText.slice(0, -1) : rawText

    if (activeFence) {
      if (isClosingFence(text, activeFence)) {
        blocks.push({
          from: activeFence.from,
          to,
          openingLineFrom: activeFence.from,
          openingLineTo: activeFence.openingLineTo,
          closingLineFrom: from,
          closingLineTo: to,
          language: activeFence.language,
        })
        activeFence = null
      }
    } else {
      const openingFence = parseOpeningFence(text)
      if (openingFence) {
        activeFence = {
          from,
          openingLineTo: to,
          markerChar: openingFence.markerChar,
          markerLength: openingFence.markerLength,
          language: openingFence.language,
        }
      }
    }

    if (to === markdown.length) break
    from = to + 1
  }

  if (activeFence) {
    blocks.push({
      from: activeFence.from,
      to: lastLineTo,
      openingLineFrom: activeFence.from,
      openingLineTo: activeFence.openingLineTo,
      closingLineFrom: null,
      closingLineTo: null,
      language: activeFence.language,
    })
  }

  return blocks
}

export function collectFencedCodeRanges(markdown: string): TextRange[] {
  return collectFencedCodeBlocks(markdown).map(({ from, to }) => ({ from, to }))
}

function parseOpeningFence(text: string): Omit<FenceState, 'from' | 'openingLineTo'> | null {
  const match = text.match(openingFencePattern)
  if (!match) return null

  const marker = match[1]
  const info = match[2]
  if (marker[0] === '`' && info.includes('`')) return null

  return {
    markerChar: marker[0] as '`' | '~',
    markerLength: marker.length,
    language: parseFenceLanguage(info),
  }
}

function isClosingFence(text: string, fence: FenceState): boolean {
  const match = text.match(closingFencePattern)
  return Boolean(match && match[1][0] === fence.markerChar && match[1].length >= fence.markerLength)
}

function parseFenceLanguage(info: string): string | null {
  const match = info.trim().match(/^([^\s`~]+)/)
  return match?.[1] ?? null
}
