const IFRAME_TAG_PATTERN = /<iframe\b((?:[^>"']+|"[^"]*"|'[^']*')*?)><\/iframe>/gi
const HTTP_PROTOCOLS = new Set(['http:', 'https:'])
const NOISY_EXTERNAL_EMBED_HOSTS = new Set(['codepen.io'])
const PREVIEW_EXTERNAL_EMBED_CLASS = 'preview-external-embed'
const TRUSTED_IFRAME_SANDBOX =
  'allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts'
const TRUSTED_IFRAME_ALLOW = 'fullscreen; picture-in-picture'
const TRUSTED_IFRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin'

export interface PreviewExternalEmbedCopy {
  blockedLabel: string
  clickLabel: string
}

export function isNoisyExternalEmbedSource(source: string, baseOrigin: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false

  try {
    const resolvedBaseOrigin = baseOrigin.trim() || 'http://localhost'
    const resolvedSource = new URL(trimmed, resolvedBaseOrigin)
    const resolvedBase = new URL(resolvedBaseOrigin)

    if (!HTTP_PROTOCOLS.has(resolvedSource.protocol)) return false
    if (resolvedSource.origin === resolvedBase.origin) return false

    const hostname = resolvedSource.hostname.toLowerCase().replace(/^www\./u, '')
    return NOISY_EXTERNAL_EMBED_HOSTS.has(hostname)
  } catch {
    return false
  }
}

export function rewritePreviewHtmlNoisyExternalEmbeds(
  html: string,
  copy: PreviewExternalEmbedCopy,
  baseOrigin: string
): string {
  if (!html.includes('<iframe')) return html

  return html.replace(IFRAME_TAG_PATTERN, (tag: string, rawAttributes: string) => {
    const source = getHtmlAttribute(rawAttributes, 'src')
    if (!isNoisyExternalEmbedSource(source, baseOrigin)) return tag

    const host = getExternalEmbedHost(source)
    const title = getHtmlAttribute(rawAttributes, 'title') || host

    return [
      '<button',
      ' type="button"',
      ` class="${PREVIEW_EXTERNAL_EMBED_CLASS}"`,
      ` data-external-embed-src="${escapeHtmlAttribute(source)}"`,
      ` data-external-embed-host="${escapeHtmlAttribute(host)}"`,
      ` data-external-embed-title="${escapeHtmlAttribute(title)}"`,
      ` aria-label="${escapeHtmlAttribute(`${copy.clickLabel}: ${host}`)}"`,
      '>',
      `<span class="${PREVIEW_EXTERNAL_EMBED_CLASS}__title">${escapeHtml(copy.blockedLabel)}</span>`,
      `<span class="${PREVIEW_EXTERNAL_EMBED_CLASS}__host">${escapeHtml(host)}</span>`,
      `<span class="${PREVIEW_EXTERNAL_EMBED_CLASS}__hint">${escapeHtml(copy.clickLabel)}</span>`,
      '</button>',
    ].join('')
  })
}

export function activatePreviewExternalEmbed(target: EventTarget | null): boolean {
  const placeholder = (target as HTMLElement | null)?.closest<HTMLElement>('[data-external-embed-src]')
  if (!placeholder) return false

  const source = placeholder.dataset.externalEmbedSrc?.trim()
  if (!source) return false

  const iframe = document.createElement('iframe')
  iframe.src = source
  iframe.title = placeholder.dataset.externalEmbedTitle || placeholder.dataset.externalEmbedHost || 'External embed'
  iframe.setAttribute('sandbox', TRUSTED_IFRAME_SANDBOX)
  iframe.setAttribute('allow', TRUSTED_IFRAME_ALLOW)
  iframe.setAttribute('loading', 'lazy')
  iframe.setAttribute('referrerpolicy', TRUSTED_IFRAME_REFERRER_POLICY)

  placeholder.replaceWith(iframe)
  return true
}

function getHtmlAttribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`(?:^|\\s+)${escapeForRegExp(name)}="([^"]*)"`, 'i'))
  return decodeHtmlAttribute(match?.[1] ?? '')
}

function getExternalEmbedHost(source: string): string {
  try {
    const hostname = new URL(source).hostname.replace(/^www\./iu, '')
    return hostname || 'external source'
  } catch {
    return 'external source'
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value)
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
