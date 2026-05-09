import { resolveTyporaRootUrlAsset } from './imageRoots.ts'

const IMG_TAG_PATTERN = /<img\b((?:[^>"']+|"[^"]*"|'[^']*')*?)(\s*\/?)>/gi
const SOURCE_TAG_PATTERN = /<source\b((?:[^>"']+|"[^"]*"|'[^']*')*?)(\s*\/?)>/gi

interface RewriteRenderedHtmlImageSourcesOptions {
  frontMatter?: Record<string, string> | null
}

export function rewriteRenderedHtmlImageSources(
  html: string,
  options: RewriteRenderedHtmlImageSourcesOptions = {}
): string {
  if (!html.includes('<img') && !html.includes('<source')) return html

  const rootUrl = getFrontMatterValue(options.frontMatter, 'typora-root-url')
  if (!rootUrl) return html

  const htmlWithResolvedSourceSets = html.replace(
    SOURCE_TAG_PATTERN,
    (_, rawAttributes: string, selfClosingSlash: string) => {
      const sourceSet = getHtmlAttribute(rawAttributes, 'srcset')
      if (!sourceSet) {
        return buildSourceTag(rawAttributes, selfClosingSlash)
      }

      const resolvedSourceSet = resolveTyporaRootUrlSourceSet(sourceSet, rootUrl)
      if (!resolvedSourceSet || resolvedSourceSet === sourceSet) {
        return buildSourceTag(rawAttributes, selfClosingSlash)
      }

      return buildSourceTag(upsertHtmlAttribute(rawAttributes, 'srcset', resolvedSourceSet), selfClosingSlash)
    }
  )

  return htmlWithResolvedSourceSets.replace(IMG_TAG_PATTERN, (_, rawAttributes: string, selfClosingSlash: string) => {
    const source = getHtmlAttribute(rawAttributes, 'src')
    if (!source) {
      return buildImageTag(rawAttributes, selfClosingSlash)
    }

    const resolvedSource = resolveTyporaRootUrlAsset(source, rootUrl)
    if (!resolvedSource || resolvedSource === source) {
      return buildImageTag(rawAttributes, selfClosingSlash)
    }

    return buildImageTag(upsertHtmlAttribute(rawAttributes, 'src', resolvedSource), selfClosingSlash)
  })
}

function resolveTyporaRootUrlSourceSet(sourceSet: string, rootUrl: string): string {
  const candidates = collectSrcSetCandidates(sourceSet)
  if (candidates.length === 0) return sourceSet

  return candidates
    .map(({ source, descriptor }) => {
      const resolvedSource = resolveTyporaRootUrlAsset(source, rootUrl)
      return descriptor ? `${resolvedSource} ${descriptor}` : resolvedSource
    })
    .join(', ')
}

function collectSrcSetCandidates(value: string): { source: string; descriptor: string }[] {
  const candidates: { source: string; descriptor: string }[] = []
  let index = 0

  while (index < value.length) {
    while (index < value.length && (value[index] === ',' || /\s/u.test(value[index]))) {
      index += 1
    }

    const sourceStart = index
    const isDataUrl = value.slice(index, index + 5).toLowerCase() === 'data:'
    while (index < value.length && !/\s/u.test(value[index]) && (isDataUrl || value[index] !== ',')) {
      index += 1
    }

    const source = value.slice(sourceStart, index).trim()
    const descriptorStart = index
    while (index < value.length && value[index] !== ',') {
      index += 1
    }

    if (source) {
      candidates.push({
        source,
        descriptor: value.slice(descriptorStart, index).trim(),
      })
    }
  }

  return candidates
}

function getFrontMatterValue(frontMatter: Record<string, string> | null | undefined, key: string): string {
  if (!frontMatter) return ''
  const normalizedKey = key.trim().toLowerCase()
  for (const [entryKey, entryValue] of Object.entries(frontMatter)) {
    if (entryKey.trim().toLowerCase() === normalizedKey) {
      return entryValue
    }
  }
  return ''
}

function buildImageTag(attributes: string, selfClosingSlash: string): string {
  const normalizedAttributes = attributes.replace(/\s+/g, ' ').trim()
  return normalizedAttributes
    ? `<img ${normalizedAttributes}${selfClosingSlash}>`
    : `<img${selfClosingSlash}>`
}

function buildSourceTag(attributes: string, selfClosingSlash: string): string {
  const normalizedAttributes = attributes.replace(/\s+/g, ' ').trim()
  return normalizedAttributes
    ? `<source ${normalizedAttributes}${selfClosingSlash}>`
    : `<source${selfClosingSlash}>`
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
