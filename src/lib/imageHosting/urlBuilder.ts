const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

const REMOTE_URL_PATTERN = /^(?:https?:|data:|file:|\/\/)/i

const FILENAME_SAFE_PATTERN = /[^A-Za-z0-9._-]+/g

export function isLocalImageReference(destination: string): boolean {
  const trimmed = destination.trim()
  if (trimmed.length === 0) return false
  return !REMOTE_URL_PATTERN.test(trimmed)
}

export function hasSupportedImageExtension(source: string): boolean {
  return IMAGE_EXTENSION_PATTERN.test(source)
}

export function extractImageExtension(source: string): string {
  const match = source.match(IMAGE_EXTENSION_PATTERN)
  if (!match) return ''
  return match[0].toLowerCase()
}

interface BuildRemoteFilenameInput {
  sourcePath: string
  documentName: string | null
  batchId: number
  index: number
  now?: Date
}

export function buildRemoteFilename(input: BuildRemoteFilenameInput): string {
  const now = input.now ?? new Date()
  const year = now.getUTCFullYear().toString().padStart(4, '0')
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0')

  const extension = extractImageExtension(input.sourcePath) || '.png'

  const documentSlug = sanitizeSlug(input.documentName ?? 'document')
  const baseName = sanitizeSlug(stripExtension(basename(input.sourcePath)) || 'image')

  const stem = baseName.length > 0 ? baseName : 'image'
  const suffix = `${documentSlug}-${input.batchId}-${input.index}`

  return `${year}/${month}/${stem}-${suffix}${extension}`
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(0, idx) : name
}

function sanitizeSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(FILENAME_SAFE_PATTERN, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase()
}
