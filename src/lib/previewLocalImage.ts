import { normalizeLocalPreviewImageSource } from './previewLocalImages.ts'

const localPreviewImageCache = new Map<string, Promise<string | null>>()

export async function loadLocalPreviewImage(source: string, documentPath: string | null): Promise<string | null> {
  const trimmedSource = source.trim()
  const trimmedDocumentPath = documentPath?.trim() ?? ''
  if (!trimmedSource) {
    return null
  }

  if (!isTauriRuntime()) {
    return trimmedSource
  }

  const cacheKey = `${trimmedDocumentPath}\n${trimmedSource}`
  const cached = localPreviewImageCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const task = (async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      return await invoke<string>('fetch_local_image_data_url', {
        source: normalizeLocalImageSource(trimmedSource),
        documentPath: trimmedDocumentPath || null,
      })
    } catch {
      return null
    }
  })()

  localPreviewImageCache.set(cacheKey, task)
  void task.then((resolvedSource) => {
    if (resolvedSource === null) {
      localPreviewImageCache.delete(cacheKey)
    }
  })
  return task
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function normalizeLocalImageSource(source: string): string {
  if (!source) return source

  try {
    return normalizeLocalPreviewImageSource(decodeURI(source))
  } catch {
    return normalizeLocalPreviewImageSource(source)
  }
}
