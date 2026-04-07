export interface TextRange {
  from: number
  to: number
}

interface FenceState {
  from: number
  markerChar: '`' | '~'
  markerLength: number
}

const openingFencePattern = /^\s{0,3}(`{3,}|~{3,})(.*)$/
const closingFencePattern = /^\s{0,3}(`{3,}|~{3,})\s*$/

export function collectFencedCodeRanges(markdown: string): TextRange[] {
  const ranges: TextRange[] = []
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
        ranges.push({ from: activeFence.from, to })
        activeFence = null
      }
    } else {
      const openingFence = parseOpeningFence(text)
      if (openingFence) {
        activeFence = {
          from,
          markerChar: openingFence.markerChar,
          markerLength: openingFence.markerLength,
        }
      }
    }

    if (to === markdown.length) break
    from = to + 1
  }

  if (activeFence) {
    ranges.push({ from: activeFence.from, to: lastLineTo })
  }

  return ranges
}

function parseOpeningFence(text: string): Omit<FenceState, 'from'> | null {
  const match = text.match(openingFencePattern)
  if (!match) return null

  const marker = match[1]
  const info = match[2]
  if (marker[0] === '`' && info.includes('`')) return null

  return {
    markerChar: marker[0] as '`' | '~',
    markerLength: marker.length,
  }
}

function isClosingFence(text: string, fence: FenceState): boolean {
  const match = text.match(closingFencePattern)
  return Boolean(match && match[1][0] === fence.markerChar && match[1].length >= fence.markerLength)
}
