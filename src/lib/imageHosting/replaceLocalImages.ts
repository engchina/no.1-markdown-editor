import {
  buildRemoteFilename,
  hasSupportedImageExtension,
  isLocalImageReference,
} from './urlBuilder.ts'

const MARKDOWN_IMAGE_PATTERN =
  /!\[(?<alt>(?:\\.|[^\]])*)\]\(\s*(?:<(?<destinationBracketed>[^>\r\n]+)>|(?<destinationBare>[^\s)]+))(?<title>\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\s*\)/g

export interface ReplaceLocalImagesUploader {
  (input: { localPath: string; remoteFilename: string }): Promise<{ url: string }>
}

export interface ReplaceLocalImagesOptions {
  markdown: string
  documentPath: string | null
  documentName: string | null
  batchId?: number
  uploader: ReplaceLocalImagesUploader
  resolveLocalPath: (rawDestination: string, documentPath: string | null) => string | null
  now?: Date
}

export interface ReplaceLocalImagesReport {
  rewrittenMarkdown: string
  uploaded: Array<{ sourcePath: string; remoteUrl: string }>
  skipped: Array<{ sourcePath: string; reason: 'remote' | 'unsupported' | 'unresolved' }>
  failed: Array<{ sourcePath: string; error: string }>
}

interface Replacement {
  from: number
  to: number
  value: string
}

export async function replaceLocalImagesWithRemoteUrls(
  options: ReplaceLocalImagesOptions
): Promise<ReplaceLocalImagesReport> {
  const matches = Array.from(options.markdown.matchAll(MARKDOWN_IMAGE_PATTERN))
  const report: ReplaceLocalImagesReport = {
    rewrittenMarkdown: options.markdown,
    uploaded: [],
    skipped: [],
    failed: [],
  }
  if (matches.length === 0) return report

  const batchId = options.batchId ?? Date.now()
  const replacements: Replacement[] = []
  let index = 0

  for (const match of matches) {
    const rawDestination = extractDestination(match)
    if (!rawDestination) continue

    if (!isLocalImageReference(rawDestination)) {
      report.skipped.push({ sourcePath: rawDestination, reason: 'remote' })
      continue
    }

    if (!hasSupportedImageExtension(rawDestination)) {
      report.skipped.push({ sourcePath: rawDestination, reason: 'unsupported' })
      continue
    }

    const resolvedPath = options.resolveLocalPath(rawDestination, options.documentPath)
    if (!resolvedPath) {
      report.skipped.push({ sourcePath: rawDestination, reason: 'unresolved' })
      continue
    }

    index += 1
    const remoteFilename = buildRemoteFilename({
      sourcePath: resolvedPath,
      documentName: options.documentName,
      batchId,
      index,
      now: options.now,
    })

    try {
      const result = await options.uploader({ localPath: resolvedPath, remoteFilename })
      const alt = match.groups?.alt ?? ''
      const titleSuffix = match.groups?.title ?? ''
      replacements.push({
        from: match.index ?? 0,
        to: (match.index ?? 0) + match[0].length,
        value: `![${alt}](${result.url}${titleSuffix})`,
      })
      report.uploaded.push({ sourcePath: resolvedPath, remoteUrl: result.url })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      report.failed.push({ sourcePath: resolvedPath, error: message })
    }
  }

  if (replacements.length === 0) return report

  report.rewrittenMarkdown = applyReplacements(options.markdown, replacements)
  return report
}

function extractDestination(match: RegExpMatchArray): string {
  return (match.groups?.destinationBracketed ?? match.groups?.destinationBare ?? '').trim()
}

function applyReplacements(markdown: string, replacements: Replacement[]): string {
  let output = markdown
  for (const replacement of [...replacements].reverse()) {
    output = output.slice(0, replacement.from) + replacement.value + output.slice(replacement.to)
  }
  return output
}
