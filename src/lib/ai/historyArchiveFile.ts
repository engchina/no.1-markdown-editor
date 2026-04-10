export function buildAIHistoryArchiveFileName(date = new Date()) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `ai-history-${year}${month}${day}-${hour}${minute}.json`
}

export async function saveAIHistoryArchiveText(content: string, fileName: string): Promise<boolean> {
  return saveAIHistoryJsonText(content, fileName)
}

export async function saveAIHistoryJsonText(content: string, fileName: string): Promise<boolean> {
  const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  if (isDesktop) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const targetPath = await save({
      defaultPath: fileName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!targetPath || typeof targetPath !== 'string') return false

    await writeTextFile(targetPath, content)
    return true
  }

  if (typeof document === 'undefined') return false
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export async function readAIHistoryArchiveText(): Promise<string | null> {
  const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  if (isDesktop) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!selectedPath || typeof selectedPath !== 'string') return null

    return readTextFile(selectedPath)
  }

  if (typeof document === 'undefined') return null

  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        resolve(await file.text())
      } catch (error) {
        reject(error)
      }
    }
    input.click()
  })
}
