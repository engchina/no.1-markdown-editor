import {
  buildRelativeMarkdownImagePath,
  DEFAULT_MARKDOWN_IMAGE_DIRECTORY,
  getImageExtensionForMimeType,
} from './fileTypes.ts'

const EMBEDDED_MARKDOWN_IMAGE_PATTERN =
  /!\[(?<alt>(?:\\.|[^\]])*)\]\(\s*(?:<)?(?<dataUrl>data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+)(?:>)?(?<title>\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\s*\)/g
const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i

export interface PersistEmbeddedImageOptions {
  imageDirectory?: string
  batchId?: number
  persistImage: (fileName: string, bytes: Uint8Array) => Promise<void>
}

interface EmbeddedMarkdownImageReplacement {
  from: number
  to: number
  value: string
}

export async function materializeEmbeddedMarkdownImages(
  markdown: string,
  options: PersistEmbeddedImageOptions
): Promise<string> {
  const matches = Array.from(markdown.matchAll(EMBEDDED_MARKDOWN_IMAGE_PATTERN))
  if (matches.length === 0) return markdown

  const batchId = options.batchId ?? Date.now()
  const imageDirectory = options.imageDirectory ?? DEFAULT_MARKDOWN_IMAGE_DIRECTORY
  const replacements: EmbeddedMarkdownImageReplacement[] = []
  let persistedCount = 0

  for (const match of matches) {
    const dataUrl = match.groups?.dataUrl ?? ''
    const parsed = decodeEmbeddedImageDataUrl(dataUrl)
    if (!parsed) continue

    persistedCount += 1
    const fileName = buildEmbeddedImageFileName(batchId, persistedCount, parsed.mimeType)
    await options.persistImage(fileName, parsed.bytes)

    const alt = match.groups?.alt ?? ''
    const titleSuffix = match.groups?.title ?? ''
    replacements.push({
      from: match.index ?? 0,
      to: (match.index ?? 0) + match[0].length,
      value: `![${alt}](${buildRelativeMarkdownImagePath(fileName, imageDirectory)}${titleSuffix})`,
    })
  }

  if (replacements.length === 0) return markdown
  return applyReplacements(markdown, replacements)
}

function decodeEmbeddedImageDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = dataUrl.trim().match(DATA_URL_PATTERN)
  if (!match) return null

  const mimeType = match[1].toLowerCase()
  const payload = match[2].replace(/\s+/g, '')

  try {
    if (typeof atob === 'function') {
      const binary = atob(payload)
      return {
        mimeType,
        bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      }
    }

    const buffer = Buffer.from(payload, 'base64')
    return {
      mimeType,
      bytes: new Uint8Array(buffer),
    }
  } catch {
    return null
  }
}

function buildEmbeddedImageFileName(batchId: number, index: number, mimeType: string): string {
  const suffix = index > 1 ? `-${index}` : ''
  const extension = getImageExtensionForMimeType(mimeType)
  return `image-${batchId}${suffix}.${extension}`
}

function applyReplacements(markdown: string, replacements: EmbeddedMarkdownImageReplacement[]): string {
  let output = markdown

  for (const replacement of [...replacements].reverse()) {
    output = output.slice(0, replacement.from) + replacement.value + output.slice(replacement.to)
  }

  return output
}
