import { claimHeadingId, createHeadingIdState, type HeadingIdState, slugifyHeading } from './headingIds.ts'
import { parseFrontMatter } from './frontMatter.ts'

export interface OutlineHeading {
  level: number
  text: string
  id: string
  line: number
}

export interface MarkdownTableOfContentsOptions {
  minLevel?: number
  maxLevel?: number
}

export { slugifyHeading }

export function extractHeadings(markdown: string): OutlineHeading[] {
  const lines = markdown.split(/\r?\n/)
  const frontMatter = parseFrontMatter(markdown)
  const frontMatterEndLine = frontMatter.range ? countLinesBefore(markdown, frontMatter.range.to) : 0
  const headings: OutlineHeading[] = []
  const headingIds = createHeadingIdState()
  let fenceMarker: string | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    if (frontMatterEndLine > 0 && index < frontMatterEndLine) continue

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fenceMarker === null) {
        fenceMarker = marker
        continue
      }
      if (fenceMarker === marker) {
        fenceMarker = null
        continue
      }
    }

    if (fenceMarker) continue

    const atxMatch = line.match(/^\s{0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/)
    if (atxMatch) {
      pushHeading(headings, headingIds, atxMatch[1].length, atxMatch[2], index + 1)
      continue
    }

    const nextLine = lines[index + 1]
    const setextMatch =
      nextLine?.match(/^\s{0,3}(=+|-+)\s*$/) &&
      line.trim() !== '' &&
      !/^\s{0,3}(>|[-*+]\s|\d+\.\s)/.test(line)
    if (!setextMatch) continue

    const level = nextLine.includes('=') ? 1 : 2
    pushHeading(headings, headingIds, level, line, index + 1)
    index += 1
  }

  return headings
}

function countLinesBefore(source: string, offset: number): number {
  return (source.slice(0, offset).match(/\r\n|\n|\r/gu)?.length ?? 0) + 1
}

function pushHeading(
  headings: OutlineHeading[],
  headingIds: HeadingIdState,
  level: number,
  rawText: string,
  line: number
) {
  const text = rawText.trim()
  if (!text) return

  headings.push({
    level,
    text,
    id: claimHeadingId(text, headingIds),
    line,
  })
}

export function buildMarkdownTableOfContents(
  markdown: string,
  options: MarkdownTableOfContentsOptions = {}
): string {
  const minLevel = clampHeadingLevel(options.minLevel ?? 2)
  const maxLevel = clampHeadingLevel(options.maxLevel ?? 3)
  const headings = extractHeadings(markdown).filter((heading) =>
    heading.level >= minLevel && heading.level <= maxLevel
  )

  if (headings.length === 0) return ''

  const baseLevel = Math.min(...headings.map((heading) => heading.level))

  return headings
    .map((heading) => {
      const indent = '  '.repeat(Math.max(0, heading.level - baseLevel))
      return `${indent}- [${escapeTableOfContentsLinkText(heading.text)}](#${heading.id})`
    })
    .join('\n')
}

function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level)) return 1
  return Math.min(6, Math.max(1, Math.trunc(level)))
}

function escapeTableOfContentsLinkText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}
