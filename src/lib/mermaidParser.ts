export type SupportedMermaidParserType =
  | 'architecture'
  | 'gitGraph'
  | 'info'
  | 'packet'
  | 'pie'
  | 'radar'
  | 'treemap'
  | 'treeView'
  | 'wardley'

type MermaidLangiumParser = {
  parse: (text: string) => {
    lexerErrors: Array<{ line?: number; column?: number; message: string }>
    parserErrors: Array<{ token: { startLine?: number; startColumn?: number }; message: string }>
    value: unknown
  }
}

type MermaidParserServices = Record<string, { parser: { LangiumParser: MermaidLangiumParser } }>
type MermaidParserFactory = () => MermaidParserServices
type MermaidParserCoreModule = {
  createArchitectureServices: MermaidParserFactory
  createGitGraphServices: MermaidParserFactory
  createInfoServices: MermaidParserFactory
  createPacketServices: MermaidParserFactory
  createPieServices: MermaidParserFactory
  createRadarServices: MermaidParserFactory
  createTreemapServices: MermaidParserFactory
  createTreeViewServices: MermaidParserFactory
  createWardleyServices: MermaidParserFactory
}

type ParserRecord = Record<SupportedMermaidParserType, MermaidLangiumParser>

const parsers: Partial<ParserRecord> = {}
let mermaidParserCorePromise: Promise<MermaidParserCoreModule> | null = null
const nodeMermaidParserSpecifier = '@mermaid-js/parser'

const parserFactoryMap = {
  architecture: { create: 'createArchitectureServices', service: 'Architecture' },
  gitGraph: { create: 'createGitGraphServices', service: 'GitGraph' },
  info: { create: 'createInfoServices', service: 'Info' },
  packet: { create: 'createPacketServices', service: 'Packet' },
  pie: { create: 'createPieServices', service: 'Pie' },
  radar: { create: 'createRadarServices', service: 'Radar' },
  treemap: { create: 'createTreemapServices', service: 'Treemap' },
  treeView: { create: 'createTreeViewServices', service: 'TreeView' },
  wardley: { create: 'createWardleyServices', service: 'Wardley' },
} as const satisfies Record<SupportedMermaidParserType, { create: keyof MermaidParserCoreModule; service: string }>

function loadMermaidParserCore(): Promise<MermaidParserCoreModule> {
  mermaidParserCorePromise ??= (
    typeof window === 'undefined'
      ? (import(nodeMermaidParserSpecifier) as unknown as Promise<MermaidParserCoreModule>)
      : (
          // @ts-expect-error Vite resolves this alias to the upstream parser package at runtime.
          import('@mermaid-js/parser-upstream') as Promise<MermaidParserCoreModule>
        )
  ).catch((error) => {
    mermaidParserCorePromise = null
    throw error
  })
  return mermaidParserCorePromise
}

function formatMermaidParseErrorMessage(result: {
  lexerErrors: Array<{ line?: number; column?: number; message: string }>
  parserErrors: Array<{ token: { startLine?: number; startColumn?: number }; message: string }>
}): string {
  const lexerErrors = result.lexerErrors.map((error) => {
    const line = error.line !== undefined && !Number.isNaN(error.line) ? error.line : '?'
    const column = error.column !== undefined && !Number.isNaN(error.column) ? error.column : '?'
    return `Lexer error on line ${line}, column ${column}: ${error.message}`
  }).join('\n')

  const parserErrors = result.parserErrors.map((error) => {
    const line =
      error.token.startLine !== undefined && !Number.isNaN(error.token.startLine)
        ? error.token.startLine
        : '?'
    const column =
      error.token.startColumn !== undefined && !Number.isNaN(error.token.startColumn)
        ? error.token.startColumn
        : '?'
    return `Parse error on line ${line}, column ${column}: ${error.message}`
  }).join('\n')

  return `Parsing failed: ${lexerErrors} ${parserErrors}`.trim()
}

async function ensureParser(type: SupportedMermaidParserType): Promise<MermaidLangiumParser> {
  const existing = parsers[type]
  if (existing) return existing

  const module = await loadMermaidParserCore()
  const mapping = parserFactoryMap[type]
  const createServices = module[mapping.create]
  if (typeof createServices !== 'function') {
    throw new Error(`Mermaid parser factory "${mapping.create}" for "${type}" is unavailable`)
  }

  const services = createServices()
  const parser = services[mapping.service]?.parser?.LangiumParser
  if (!parser || typeof parser.parse !== 'function') {
    throw new Error(`Mermaid parser service "${mapping.service}" for "${type}" is unavailable`)
  }

  parsers[type] = parser
  return parser
}

export async function warmMermaidParser(type: SupportedMermaidParserType): Promise<void> {
  await ensureParser(type)
}

export async function parse(diagramType: string, text: string): Promise<unknown> {
  if (!(diagramType in parserFactoryMap)) {
    throw new Error(`Unknown diagram type: ${diagramType}`)
  }

  const type = diagramType as SupportedMermaidParserType
  const parser = await ensureParser(type)
  const result = parser.parse(text)
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error(formatMermaidParseErrorMessage(result))
  }

  return result.value
}
