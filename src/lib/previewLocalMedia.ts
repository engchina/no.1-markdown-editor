const MEDIA_TAG_PATTERN = /<(audio|video)\b((?:[^>"']+|"[^"]*"|'[^']*')*?)(\s*\/?)>/gi
const MEDIA_SOURCE_TAG_PATTERN = /<(source|track)\b((?:[^>"']+|"[^"]*"|'[^']*')*?)(\s*\/?)>/gi

type LocalMediaResolver = (filePath: string, originalSource: string) => string | null

interface RewritePreviewHtmlLocalMediaOptions {
  documentPath?: string | null
  resolveMediaSource?: LocalMediaResolver
}

const MEDIA_SOURCE_ATTRIBUTES_BY_TAG: Record<string, readonly string[]> = {
  audio: ['src'],
  source: ['src'],
  track: ['src'],
  video: ['poster', 'src'],
}

export function rewritePreviewHtmlLocalMedia(
  html: string,
  options: RewritePreviewHtmlLocalMediaOptions = {}
): string {
  const resolveMediaSource = options.resolveMediaSource
  if (!html || !/<(?:audio|video|source|track)\b/i.test(html) || !resolveMediaSource) {
    return html
  }
  const documentPath = options.documentPath

  const replaceMediaTag = (
    match: string,
    tagName: string,
    rawAttributes: string,
    selfClosingSlash: string
  ) => {
    const rewrittenAttributes = rewriteLocalMediaAttributes(
      tagName.toLowerCase(),
      rawAttributes,
      documentPath,
      resolveMediaSource
    )
    if (rewrittenAttributes === rawAttributes) return match
    return buildHtmlTag(tagName, rewrittenAttributes, selfClosingSlash)
  }

  return html
    .replace(MEDIA_TAG_PATTERN, replaceMediaTag)
    .replace(MEDIA_SOURCE_TAG_PATTERN, replaceMediaTag)
}

export function isLocalPreviewMediaSource(
  source: string | null | undefined,
  documentPath: string | null | undefined
): boolean {
  const trimmed = source?.trim() ?? ''
  if (!trimmed) return false
  if (/^(https?:|data:|blob:|asset:)/i.test(trimmed)) return false
  if (trimmed.startsWith('//')) return false
  if (/^file:/i.test(trimmed)) return true
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) return true
  if (trimmed.startsWith('/')) return true
  return Boolean(documentPath?.trim())
}

export function resolveLocalPreviewMediaPath(
  source: string,
  documentPath: string | null | undefined
): string | null {
  const trimmed = source.trim()
  if (!trimmed) return null

  if (/^file:/i.test(trimmed)) {
    return fileUrlToPath(trimmed)
  }

  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('/')) {
    return decodeUriBestEffort(trimmed)
  }

  const parent = getParentPath(documentPath)
  if (!parent) return null
  return joinLocalPath(parent, decodeUriBestEffort(trimmed))
}

export function resolveTauriLocalMediaAssetUrl(
  source: string,
  documentPath: string | null | undefined
): string | null {
  if (!isTauriRuntime()) return null

  const filePath = resolveLocalPreviewMediaPath(source, documentPath)
  if (!filePath) return null

  const internals = (window as Window & {
    __TAURI_INTERNALS__?: {
      convertFileSrc?: (filePath: string, protocol?: string) => string
    }
  }).__TAURI_INTERNALS__

  try {
    return internals?.convertFileSrc?.(filePath, 'asset') ?? null
  } catch {
    return null
  }
}

function rewriteLocalMediaAttributes(
  tagName: string,
  rawAttributes: string,
  documentPath: string | null | undefined,
  resolveMediaSource: LocalMediaResolver
): string {
  const sourceAttributes = MEDIA_SOURCE_ATTRIBUTES_BY_TAG[tagName]
  if (!sourceAttributes) return rawAttributes

  let nextAttributes = rawAttributes
  for (const attributeName of sourceAttributes) {
    const source = getHtmlAttribute(nextAttributes, attributeName)
    if (!isLocalPreviewMediaSource(source, documentPath)) continue

    const filePath = resolveLocalPreviewMediaPath(source, documentPath)
    if (!filePath) continue

    const resolvedSource = resolveMediaSource(filePath, source)
    if (!resolvedSource) continue

    nextAttributes = upsertHtmlAttribute(nextAttributes, attributeName, resolvedSource)
  }

  return nextAttributes
}

function fileUrlToPath(source: string): string | null {
  try {
    const url = new URL(source)
    if (url.protocol !== 'file:') return null

    const pathname = decodeURIComponent(url.pathname)
    if (url.host) {
      return `//${url.host}${pathname}`
    }

    return /^\/[A-Za-z]:\//u.test(pathname) ? pathname.slice(1) : pathname
  } catch {
    return null
  }
}

function getParentPath(documentPath: string | null | undefined): string | null {
  const trimmed = documentPath?.trim() ?? ''
  if (!trimmed) return null

  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (slash < 0) return null
  return trimmed.slice(0, slash)
}

function joinLocalPath(parent: string, relativeSource: string): string {
  const separator = parent.includes('\\') ? '\\' : '/'
  const normalizedRelative = relativeSource
    .replace(/^(?:\.\/|\.\\)+/g, '')
    .replace(/[\\/]+/g, separator)
  return `${parent}${parent.endsWith(separator) ? '' : separator}${normalizedRelative}`
}

function decodeUriBestEffort(value: string): string {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

function buildHtmlTag(tagName: string, attributes: string, selfClosingSlash: string): string {
  const normalizedAttributes = attributes.replace(/\s+/g, ' ').trim()
  return normalizedAttributes
    ? `<${tagName} ${normalizedAttributes}${selfClosingSlash}>`
    : `<${tagName}${selfClosingSlash}>`
}

function getHtmlAttribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`(?:^|\\s+)${escapeForRegExp(name)}="([^"]*)"`, 'i'))
  return decodeHtmlAttribute(match?.[1] ?? '')
}

function upsertHtmlAttribute(attributes: string, name: string, value: string): string {
  const escapedValue = escapeHtmlAttribute(value)
  const pattern = new RegExp(`(^|\\s+)${escapeForRegExp(name)}="[^"]*"`, 'i')
  if (pattern.test(attributes)) {
    return attributes.replace(pattern, `$1${name}="${escapedValue}"`)
  }

  return `${attributes} ${name}="${escapedValue}"`
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
