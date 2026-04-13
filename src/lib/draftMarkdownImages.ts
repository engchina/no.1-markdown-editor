import {
  buildRelativeMarkdownImagePath,
  DEFAULT_MARKDOWN_IMAGE_DIRECTORY,
  getImageFileExtension,
} from './fileTypes.ts'

const DRAFT_MARKDOWN_IMAGE_PATTERN =
  /!\[(?<alt>(?:\\.|[^\]])*)\]\(\s*(?:<(?<destinationBracketed>[^>\r\n]+)>|(?<destinationBare>[^\s)]+))(?<title>\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\s*\)/g

export const DEFAULT_DRAFT_IMAGE_DIRECTORY = 'draft-images'

interface DraftMarkdownImageReplacement {
  from: number
  to: number
  value: string
}

export interface MaterializeDraftMarkdownImagesOptions {
  batchId?: number
  imageDirectory?: string
  draftRoots: string[]
  persistImage: (fileName: string, sourcePath: string) => Promise<void>
}

export async function materializeDraftMarkdownImages(
  markdown: string,
  options: MaterializeDraftMarkdownImagesOptions
): Promise<string> {
  const matches = Array.from(markdown.matchAll(DRAFT_MARKDOWN_IMAGE_PATTERN))
  if (matches.length === 0) return markdown

  const batchId = options.batchId ?? Date.now()
  const imageDirectory = options.imageDirectory ?? DEFAULT_MARKDOWN_IMAGE_DIRECTORY
  const normalizedDraftRoots = options.draftRoots
    .map(resolveDraftImageSourcePath)
    .filter((root): root is string => root.length > 0)

  if (normalizedDraftRoots.length === 0) return markdown

  const replacements: DraftMarkdownImageReplacement[] = []
  let persistedCount = 0

  for (const match of matches) {
    const source = extractMarkdownImageDestination(match)
    const resolvedSourcePath = resolveDraftImageSourcePath(source)
    if (!resolvedSourcePath || !isSourceInDraftRoots(resolvedSourcePath, normalizedDraftRoots)) {
      continue
    }

    persistedCount += 1
    const fileName = buildDraftImageFileName(batchId, persistedCount, resolvedSourcePath)
    await options.persistImage(fileName, resolvedSourcePath)

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

function extractMarkdownImageDestination(match: RegExpMatchArray): string {
  return match.groups?.destinationBracketed ?? match.groups?.destinationBare ?? ''
}

function resolveDraftImageSourcePath(source: string): string {
  const trimmed = source.trim()
  if (!trimmed) return ''

  if (/^file:/i.test(trimmed)) {
    return resolveFileUrlPath(trimmed)
  }

  return normalizeDraftPath(trimmed)
}

function resolveFileUrlPath(fileUrl: string): string {
  try {
    const parsed = new URL(fileUrl)
    if (parsed.protocol !== 'file:') return ''

    const decodedPath = decodeURIComponent(parsed.pathname)
    const networkPath = parsed.host ? `//${parsed.host}${decodedPath}` : decodedPath
    return normalizeDraftPath(
      /^\/[A-Za-z]:\//.test(networkPath) ? networkPath.slice(1) : networkPath
    )
  } catch {
    return ''
  }
}

function normalizeDraftPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '')
}

function normalizeDraftPathForComparison(path: string): string {
  const normalized = normalizeDraftPath(path)
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')) {
    return normalized.toLowerCase()
  }
  return normalized
}

function isSourceInDraftRoots(sourcePath: string, draftRoots: string[]): boolean {
  const normalizedSource = normalizeDraftPathForComparison(sourcePath)
  return draftRoots.some((draftRoot) => {
    const normalizedRoot = normalizeDraftPathForComparison(draftRoot)
    return normalizedSource === normalizedRoot || normalizedSource.startsWith(`${normalizedRoot}/`)
  })
}

function buildDraftImageFileName(batchId: number, index: number, sourcePath: string): string {
  const suffix = index > 1 ? `-${index}` : ''
  const extension = getImageFileExtension(sourcePath)
  return `image-${batchId}${suffix}.${extension}`
}

function applyReplacements(markdown: string, replacements: DraftMarkdownImageReplacement[]): string {
  let output = markdown

  for (const replacement of [...replacements].reverse()) {
    output = output.slice(0, replacement.from) + replacement.value + output.slice(replacement.to)
  }

  return output
}
