interface HastNode {
  type?: string
  tagName?: string
  children?: HastNode[]
  properties?: Record<string, unknown>
  position?: {
    start?: {
      offset?: number
    }
  }
}

interface VFileLike {
  value?: unknown
  data?: Record<string, unknown>
}

const TRUSTED_IFRAME_SANDBOX =
  'allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts'
const TRUSTED_IFRAME_ALLOW = 'fullscreen; picture-in-picture'
const TRUSTED_IFRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin'

const IFRAME_TAG = 'iframe'
const MEDIA_TAGS = new Set(['audio', 'video'])
const MEDIA_SOURCE_TAGS = new Set(['source', 'track'])
const URL_PROPERTIES_BY_TAG: Record<string, readonly string[]> = {
  a: ['href'],
  audio: ['src'],
  iframe: ['src'],
  img: ['src'],
  source: ['src', 'srcSet'],
  track: ['src'],
  video: ['poster', 'src'],
}
const DANGEROUS_PROTOCOL_AT_START_PATTERN =
  /^\s*(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t)\s*:/iu

export function rehypePrepareRawHtmlForSanitize() {
  return createRawHtmlHardener()
}

export function rehypeHardenRawHtml() {
  return createRawHtmlHardener()
}

function createRawHtmlHardener() {
  return (tree: HastNode, file?: VFileLike) => {
    hardenChildren(tree, readMarkdownSource(file))
  }
}

function hardenChildren(node: HastNode, markdownSource: string | null): void {
  if (!Array.isArray(node.children)) return

  const children: HastNode[] = []
  for (const child of node.children) {
    if (isElement(child)) {
      stripUnsupportedRawHtmlAuthoringAttributes(child, markdownSource)
      normalizeUrlProperties(child)

      if (child.tagName === IFRAME_TAG && !hardenIframe(child)) {
        continue
      }

      if (MEDIA_TAGS.has(child.tagName)) {
        hardenMedia(child)
      }

      if (MEDIA_SOURCE_TAGS.has(child.tagName) && !hasRenderableSource(child)) {
        continue
      }
    }

    hardenChildren(child, markdownSource)
    children.push(child)
  }

  node.children = children
}

function stripUnsupportedRawHtmlAuthoringAttributes(
  node: HastNode & { tagName: string; properties: Record<string, unknown> },
  markdownSource: string | null
): void {
  if (!isSourceAuthoredRawHtmlElement(node, markdownSource)) return

  const properties = node.properties ?? (node.properties = {})
  for (const propertyName of Object.keys(properties)) {
    if (
      propertyName === 'id' ||
      propertyName === 'class' ||
      propertyName === 'className' ||
      /^data[A-Z0-9_]/u.test(propertyName) ||
      /^data[-:]/iu.test(propertyName)
    ) {
      delete properties[propertyName]
    }
  }
}

function hardenIframe(node: HastNode & { tagName: string; properties: Record<string, unknown> }): boolean {
  const properties = node.properties ?? (node.properties = {})
  const source = normalizeTrustedIframeSource(readStringProperty(properties.src))
  if (!source) return false

  properties.src = source
  properties.sandbox = TRUSTED_IFRAME_SANDBOX
  properties.allow = TRUSTED_IFRAME_ALLOW
  properties.loading = 'lazy'
  properties.referrerPolicy = TRUSTED_IFRAME_REFERRER_POLICY
  delete properties.allowFullScreen
  delete properties.allowfullscreen
  delete properties.srcDoc
  delete properties.srcdoc

  node.children = []
  return true
}

function normalizeUrlProperties(node: HastNode & { tagName: string; properties: Record<string, unknown> }): void {
  const propertyNames = URL_PROPERTIES_BY_TAG[node.tagName]
  if (!propertyNames) return

  const properties = node.properties ?? (node.properties = {})
  for (const propertyName of propertyNames) {
    const value = readStringProperty(properties[propertyName])
    if (!value) continue

    if (propertyName === 'srcSet') {
      const normalizedSrcSet = normalizeSrcSetForSanitize(value)
      if (normalizedSrcSet) {
        properties[propertyName] = normalizedSrcSet
      } else {
        delete properties[propertyName]
      }
      continue
    }

    properties[propertyName] = normalizeUrlForSanitize(value)
  }
}

function hardenMedia(node: HastNode & { tagName: string; properties: Record<string, unknown> }): void {
  const properties = node.properties ?? (node.properties = {})
  properties.controls = true

  if (!readStringProperty(properties.preload)) {
    properties.preload = 'metadata'
  }
}

function hasRenderableSource(node: HastNode & { tagName: string; properties: Record<string, unknown> }): boolean {
  return Boolean(readStringProperty(node.properties.src) || readStringProperty(node.properties.srcSet))
}

function normalizeTrustedIframeSource(source: string | null): string | null {
  const normalizedSource = source ? normalizeUrlForSanitize(source) : null
  if (!normalizedSource || !/^https?:\/\//iu.test(normalizedSource)) return null

  try {
    const url = new URL(normalizedSource)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function normalizeUrlForSanitize(source: string): string {
  const trimmed = source.trim()
  const scheme = /^([A-Za-z][A-Za-z\d+.-]*):/.exec(trimmed)
  if (!scheme) return trimmed

  return `${scheme[1].toLowerCase()}${trimmed.slice(scheme[1].length)}`
}

function normalizeSrcSetForSanitize(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const sourceCandidates = parseSrcSetCandidateSources(trimmed)
  if (!sourceCandidates || sourceCandidates.length === 0) return null

  return sourceCandidates.every(isSafeSrcSetCandidateSource) ? trimmed : null
}

function parseSrcSetCandidateSources(value: string): string[] | null {
  const sources: string[] = []
  let index = 0

  while (index < value.length) {
    while (index < value.length && (value[index] === ',' || /\s/u.test(value[index]))) {
      index += 1
    }

    const candidateStart = index
    const start = index
    const isDataUrl = value.slice(index, index + 5).toLowerCase() === 'data:'
    while (
      index < value.length &&
      !/\s/u.test(value[index]) &&
      (isDataUrl || value[index] !== ',')
    ) {
      index += 1
    }

    const source = value.slice(start, index).trim()
    if (source) sources.push(source)

    while (index < value.length && value[index] !== ',') {
      index += 1
    }

    if (DANGEROUS_PROTOCOL_AT_START_PATTERN.test(value.slice(candidateStart, index))) {
      return null
    }
  }

  return sources
}

function isSafeSrcSetCandidateSource(source: string): boolean {
  const normalizedSource = normalizeUrlForSanitize(source)
  const scheme = /^([A-Za-z][A-Za-z\d+.-]*):/.exec(normalizedSource)
  if (!scheme) return true

  const protocol = scheme[1].toLowerCase()
  if (protocol === 'http' || protocol === 'https' || protocol === 'file') {
    try {
      new URL(normalizedSource)
      return true
    } catch {
      return false
    }
  }

  // Srcset data URLs contain commas, which makes conservative candidate
  // validation ambiguous. Keep data images on regular src attributes only.
  return false
}

function isSourceAuthoredRawHtmlElement(node: HastNode, markdownSource: string | null): boolean {
  const offset = node.position?.start?.offset
  return typeof offset === 'number' && markdownSource?.[offset] === '<'
}

function isElement(node: HastNode): node is HastNode & { tagName: string; properties: Record<string, unknown> } {
  return node.type === 'element' && typeof node.tagName === 'string'
}

function readMarkdownSource(file?: VFileLike): string | null {
  if (typeof file?.data?.markdownSource === 'string') return file.data.markdownSource
  if (typeof file?.value === 'string') return file.value
  return null
}

function readStringProperty(value: unknown): string | null {
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string')
    return strings.length === 0 ? null : strings.join(' ')
  }

  return null
}
