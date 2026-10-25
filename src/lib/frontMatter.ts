import { LineCounter, parseDocument, stringify } from 'yaml'

export type FrontMatterValue =
  | string
  | number
  | boolean
  | null
  | FrontMatterValue[]
  | { [key: string]: FrontMatterValue }

export type FrontMatterMap = Record<string, FrontMatterValue>
export type FrontMatterStatus = 'absent' | 'valid' | 'empty' | 'invalid' | 'unclosed'

export interface FrontMatterDiagnostic {
  code: string
  message: string
  line: number
  column: number
}

export interface FrontMatterRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

export interface FrontMatterParseResult {
  status: FrontMatterStatus
  raw: string | null
  yaml: string | null
  data: FrontMatterMap
  body: string
  bodyLineOffset: number
  range: FrontMatterRange | null
  closingMarker: '---' | '...' | null
  diagnostics: FrontMatterDiagnostic[]
}

interface SourceLine {
  from: number
  to: number
  end: number
  text: string
}

const FRONT_MATTER_OPEN = /^---[ \t]*$/u
const FRONT_MATTER_CLOSE = /^(---|\.\.\.)[ \t]*$/u

export function parseFrontMatter(markdown: string): FrontMatterParseResult {
  const lines = collectSourceLines(markdown)
  const firstLine = lines[0]
  if (!firstLine || !FRONT_MATTER_OPEN.test(firstLine.text)) {
    return buildAbsentResult(markdown)
  }

  const closingLine = lines.slice(1).find((line) => FRONT_MATTER_CLOSE.test(line.text))
  if (!closingLine) {
    return {
      status: 'unclosed',
      raw: markdown,
      yaml: markdown.slice(firstLine.end),
      data: {},
      body: markdown,
      bodyLineOffset: 0,
      range: null,
      closingMarker: null,
      diagnostics: [{
        code: 'frontmatter-unclosed',
        message: 'Front matter block is not closed.',
        line: 1,
        column: 1,
      }],
    }
  }

  const closingMarker = closingLine.text.trim() as '---' | '...'
  const yaml = markdown.slice(firstLine.end, closingLine.from)
  const raw = markdown.slice(0, closingLine.to)
  let bodyFrom = closingLine.end
  if (markdown.startsWith('\r\n', bodyFrom)) bodyFrom += 2
  else if (markdown[bodyFrom] === '\n' || markdown[bodyFrom] === '\r') bodyFrom += 1

  const body = markdown.slice(bodyFrom)
  const bodyLineOffset = countNewlines(markdown.slice(0, bodyFrom))
  const range: FrontMatterRange = {
    from: firstLine.from,
    to: closingLine.to,
    contentFrom: firstLine.end,
    contentTo: closingLine.from,
  }

  if (!yaml.trim()) {
    return {
      status: 'empty',
      raw,
      yaml,
      data: {},
      body,
      bodyLineOffset,
      range,
      closingMarker,
      diagnostics: [],
    }
  }

  const lineCounter = new LineCounter()
  const document = parseDocument(yaml, {
    lineCounter,
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  })
  const diagnostics = [...document.errors, ...document.warnings].map((error) => {
    const position = error.linePos?.[0] ?? lineCounter.linePos(error.pos[0])
    return {
      code: error.code,
      message: error.message,
      line: Math.max(position.line, 1) + 1,
      column: Math.max(position.col, 1),
    }
  })

  if (document.errors.length > 0) {
    return {
      status: 'invalid', raw, yaml, data: {}, body, bodyLineOffset, range, closingMarker, diagnostics,
    }
  }

  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 100 })
  } catch (error) {
    return {
      status: 'invalid',
      raw,
      yaml,
      data: {},
      body,
      bodyLineOffset,
      range,
      closingMarker,
      diagnostics: [{
        code: 'RESOURCE_EXHAUSTION',
        message: error instanceof Error ? error.message : String(error),
        line: 2,
        column: 1,
      }],
    }
  }

  if (!isFrontMatterMap(value)) {
    return {
      status: 'invalid',
      raw,
      yaml,
      data: {},
      body,
      bodyLineOffset,
      range,
      closingMarker,
      diagnostics: [{
        code: 'frontmatter-non-mapping-root',
        message: 'Front matter must be a YAML mapping.',
        line: 2,
        column: 1,
      }],
    }
  }

  return {
    status: 'valid',
    raw,
    yaml,
    data: value,
    body,
    bodyLineOffset,
    range,
    closingMarker,
    diagnostics,
  }
}

export function getFrontMatterValue(
  frontMatter: FrontMatterMap | null | undefined,
  key: string
): FrontMatterValue | undefined {
  if (!frontMatter) return undefined
  const normalizedKey = key.trim().toLowerCase()
  for (const [entryKey, entryValue] of Object.entries(frontMatter)) {
    if (entryKey.trim().toLowerCase() === normalizedKey) return entryValue
  }
  return undefined
}

export function getFrontMatterScalar(
  frontMatter: FrontMatterMap | null | undefined,
  key: string
): string {
  const value = getFrontMatterValue(frontMatter, key)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export function formatFrontMatterValue(value: FrontMatterValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return stringify(value, { schema: 'core', lineWidth: 0 }).trimEnd()
}

function buildAbsentResult(markdown: string): FrontMatterParseResult {
  return {
    status: 'absent',
    raw: null,
    yaml: null,
    data: {},
    body: markdown,
    bodyLineOffset: 0,
    range: null,
    closingMarker: null,
    diagnostics: [],
  }
}

function collectSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  let from = 0

  while (from <= source.length) {
    const newlineIndex = source.indexOf('\n', from)
    const end = newlineIndex === -1 ? source.length : newlineIndex + 1
    let to = newlineIndex === -1 ? source.length : newlineIndex
    if (to > from && source[to - 1] === '\r') to -= 1
    lines.push({ from, to, end, text: source.slice(from, to) })
    if (newlineIndex === -1) break
    from = end
  }

  return lines
}

function countNewlines(value: string): number {
  return value.match(/\r\n|\n|\r/gu)?.length ?? 0
}

function isFrontMatterMap(value: unknown): value is FrontMatterMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
