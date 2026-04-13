import { materializeEmbeddedMarkdownImages } from './embeddedImages.ts'
import {
  DEFAULT_DRAFT_IMAGE_DIRECTORY,
  materializeDraftMarkdownImages,
} from './draftMarkdownImages.ts'
import {
  buildRelativeMarkdownImagePath,
  DEFAULT_MARKDOWN_IMAGE_DIRECTORY,
  getImageAltText,
  getImageFileExtension,
} from './fileTypes.ts'

export interface FilePersistence {
  appConfigDir(): Promise<string>
  dirname(path: string): Promise<string>
  join(...paths: string[]): Promise<string>
  copyFile(sourcePath: string, destinationPath: string): Promise<void>
  writeTextFile(path: string, content: string): Promise<void>
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>
}

export interface PersistOptions {
  batchId?: number
  imageDirectory?: string
  draftImageDirectory?: string
}

export interface PersistableImageFile {
  name: string
  type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

let tauriFilePersistencePromise: Promise<FilePersistence> | null = null

export async function getTauriFilePersistence(): Promise<FilePersistence> {
  tauriFilePersistencePromise ??= createTauriFilePersistence()
  return tauriFilePersistencePromise
}

export async function saveMarkdownDocumentWithAssets(
  markdown: string,
  savePath: string,
  persistence: FilePersistence,
  options: PersistOptions = {}
): Promise<string> {
  const batchId = options.batchId ?? Date.now()
  const imageDirectory = options.imageDirectory ?? DEFAULT_MARKDOWN_IMAGE_DIRECTORY
  const draftImageDirectory = options.draftImageDirectory ?? DEFAULT_DRAFT_IMAGE_DIRECTORY
  const imageDir = await persistence.join(await persistence.dirname(savePath), imageDirectory)
  const draftImageRoot = await persistence.join(await persistence.appConfigDir(), draftImageDirectory)

  let nextContent = await materializeEmbeddedMarkdownImages(markdown, {
    batchId,
    imageDirectory,
    persistImage: async (fileName, bytes) => {
      await persistence.writeBinaryFile(await persistence.join(imageDir, fileName), bytes)
    },
  })

  nextContent = await materializeDraftMarkdownImages(nextContent, {
    batchId: batchId + 1,
    imageDirectory,
    draftRoots: [draftImageRoot],
    persistImage: async (fileName, sourcePath) => {
      await persistence.copyFile(sourcePath, await persistence.join(imageDir, fileName))
    },
  })

  await persistence.writeTextFile(savePath, nextContent)
  return nextContent
}

export async function persistImageFilesAsMarkdown(
  files: PersistableImageFile[],
  activeTabPath: string,
  persistence: Pick<FilePersistence, 'dirname' | 'join' | 'writeBinaryFile'>,
  options: PersistOptions = {}
): Promise<string> {
  const batchId = options.batchId ?? Date.now()
  const imageDirectory = options.imageDirectory ?? DEFAULT_MARKDOWN_IMAGE_DIRECTORY
  const imageDir = await persistence.join(await persistence.dirname(activeTabPath), imageDirectory)
  const snippets = await Promise.all(
    files.map(async (file, index) => {
      const extension = getImageFileExtension(file.name, file.type)
      const altText = getImageAltText(file.name)
      const suffix = files.length > 1 ? `-${index + 1}` : ''
      const fileName = `image-${batchId}${suffix}.${extension}`

      await persistence.writeBinaryFile(await persistence.join(imageDir, fileName), new Uint8Array(await file.arrayBuffer()))
      return `![${altText}](${buildRelativeMarkdownImagePath(fileName, imageDirectory)})`
    })
  )

  return snippets.join('\n')
}

export async function persistDraftImageFilesAsMarkdown(
  files: PersistableImageFile[],
  draftId: string,
  persistence: Pick<FilePersistence, 'appConfigDir' | 'join' | 'writeBinaryFile'>,
  options: PersistOptions = {}
): Promise<string> {
  const batchId = options.batchId ?? Date.now()
  const draftImageDirectory = options.draftImageDirectory ?? DEFAULT_DRAFT_IMAGE_DIRECTORY
  const draftImageDir = await persistence.join(
    await persistence.appConfigDir(),
    draftImageDirectory,
    normalizeDraftImageScope(draftId)
  )
  const snippets = await Promise.all(
    files.map(async (file, index) => {
      const extension = getImageFileExtension(file.name, file.type)
      const altText = getImageAltText(file.name)
      const suffix = files.length > 1 ? `-${index + 1}` : ''
      const fileName = `image-${batchId}${suffix}.${extension}`
      const absolutePath = await persistence.join(draftImageDir, fileName)

      await persistence.writeBinaryFile(absolutePath, new Uint8Array(await file.arrayBuffer()))
      return `![${altText}](${formatMarkdownDestination(normalizeMarkdownFilePath(absolutePath))})`
    })
  )

  return snippets.join('\n')
}

async function createTauriFilePersistence(): Promise<FilePersistence> {
  const [{ appConfigDir, dirname, join }, { invoke }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/api/core'),
  ])

  return {
    appConfigDir,
    dirname,
    join,
    copyFile: async (sourcePath, destinationPath) => {
      await invoke('copy_file', { sourcePath, destinationPath })
    },
    writeTextFile: async (path, content) => {
      await invoke('write_file', { path, content })
    },
    writeBinaryFile: async (path, bytes) => {
      await invoke('write_binary_file', { path, bytes: Array.from(bytes) })
    },
  }
}

function normalizeDraftImageScope(scope: string): string {
  const normalized = scope.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'draft'
}

function normalizeMarkdownFilePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function formatMarkdownDestination(destination: string): string {
  const trimmed = destination.trim()
  if (!trimmed) return ''
  return /[\s()<>]/.test(trimmed) ? `<${trimmed.replace(/>/g, '%3E')}>` : trimmed
}
