const previewImageCache = new Map<string, Promise<string | null>>()

export async function loadExternalPreviewImage(source: string): Promise<string | null> {
  const trimmedSource = source.trim()
  if (!trimmedSource) {
    return null
  }

  if (!isTauriRuntime()) {
    return trimmedSource
  }

  const cached = previewImageCache.get(trimmedSource)
  if (cached) {
    return cached
  }

  const task = (async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      return await invoke<string>('fetch_remote_image_data_url', { url: trimmedSource })
    } catch {
      return null
    }
  })()

  previewImageCache.set(trimmedSource, task)
  void task.then((resolvedSource) => {
    if (resolvedSource === null) {
      previewImageCache.delete(trimmedSource)
    }
  })
  return task
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
