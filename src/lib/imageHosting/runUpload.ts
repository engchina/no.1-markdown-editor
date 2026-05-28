import { uploadImageToHosting, loadImageHostingState } from './client.ts'
import { isImageHostingReady } from './types.ts'
import {
  replaceLocalImagesWithRemoteUrls,
  type ReplaceLocalImagesReport,
} from './replaceLocalImages.ts'

export type RunImageHostingUploadOutcome =
  | { kind: 'not-configured'; message: string }
  | { kind: 'no-document'; message: string }
  | { kind: 'unsaved-document'; message: string }
  | { kind: 'no-local-images'; message: string }
  | {
      kind: 'completed'
      rewrittenMarkdown: string
      uploadedCount: number
      failedCount: number
      skippedCount: number
      report: ReplaceLocalImagesReport
    }

export interface RunImageHostingUploadInput {
  markdown: string
  documentPath: string | null
  documentName: string | null
}

export async function runImageHostingUploadForDocument(
  input: RunImageHostingUploadInput
): Promise<RunImageHostingUploadOutcome> {
  if (!input.markdown.trim()) {
    return { kind: 'no-document', message: 'Document is empty' }
  }
  if (!input.documentPath) {
    return {
      kind: 'unsaved-document',
      message: 'Save the document to disk before uploading images',
    }
  }

  const state = await loadImageHostingState().catch(() => null)
  if (!isImageHostingReady(state)) {
    return {
      kind: 'not-configured',
      message: 'Image hosting is not enabled or PAT is missing',
    }
  }

  const report = await replaceLocalImagesWithRemoteUrls({
    markdown: input.markdown,
    documentPath: input.documentPath,
    documentName: input.documentName,
    resolveLocalPath: (rawDestination, documentPath) =>
      resolveAbsoluteLocalPath(rawDestination, documentPath),
    uploader: async ({ localPath, remoteFilename }) =>
      uploadImageToHosting(localPath, remoteFilename),
  })

  if (report.uploaded.length === 0 && report.failed.length === 0) {
    return {
      kind: 'no-local-images',
      message: 'No local images to upload',
    }
  }

  return {
    kind: 'completed',
    rewrittenMarkdown: report.rewrittenMarkdown,
    uploadedCount: report.uploaded.length,
    failedCount: report.failed.length,
    skippedCount: report.skipped.length,
    report,
  }
}

export function resolveAbsoluteLocalPath(
  rawDestination: string,
  documentPath: string | null
): string | null {
  const cleaned = stripUrlNoise(rawDestination)
  if (!cleaned) return null

  const normalized = cleaned.replace(/\\/g, '/')
  if (isAbsolutePath(normalized)) {
    return normalizeSegments(normalized)
  }

  if (!documentPath) return null

  const docDir = directoryOf(documentPath.replace(/\\/g, '/'))
  if (!docDir) return null

  return normalizeSegments(`${docDir}/${normalized}`)
}

function stripUrlNoise(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const withoutHash = trimmed.split('#')[0] ?? trimmed
  return (withoutHash.split('?')[0] ?? withoutHash).trim()
}

function isAbsolutePath(path: string): boolean {
  if (path.startsWith('/')) return true
  if (/^[A-Za-z]:\//.test(path)) return true
  return false
}

function directoryOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(0, idx) : ''
}

function normalizeSegments(path: string): string {
  const isWindowsAbsolute = /^[A-Za-z]:\//.test(path)
  const isUnixAbsolute = path.startsWith('/')
  const prefix = isWindowsAbsolute ? path.slice(0, 3) : isUnixAbsolute ? '/' : ''
  const body = isWindowsAbsolute ? path.slice(3) : isUnixAbsolute ? path.slice(1) : path

  const segments: string[] = []
  for (const segment of body.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0) segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `${prefix}${segments.join('/')}`
}
