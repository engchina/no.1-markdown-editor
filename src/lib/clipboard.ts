export interface ClipboardItemLike {
  kind?: string
  type?: string
  getAsString?: ((callback: (value: string) => void) => void) | null
}

export interface ClipboardDataLike {
  getData?: ((format: string) => string) | null
  items?: ArrayLike<ClipboardItemLike> | null
  types?: ArrayLike<string> | null
}

export interface ClipboardApiBlobLike {
  text?: (() => Promise<string>) | null
}

export interface ClipboardApiItemLike {
  getType?: ((format: string) => Promise<ClipboardApiBlobLike>) | null
  types?: ArrayLike<string> | null
}

export interface ClipboardApiLike {
  read?: (() => Promise<ClipboardApiItemLike[]>) | null
  readText?: (() => Promise<string>) | null
}

export function clipboardHasType(data: ClipboardDataLike | null | undefined, mimeType: string): boolean {
  const normalizedMimeType = normalizeMimeType(mimeType)
  if (!normalizedMimeType || !data) return false

  const directValue = safeGetData(data, normalizedMimeType)
  if (directValue) return true

  const types = Array.from(data.types ?? []).map((type) => normalizeMimeType(type))
  if (types.includes(normalizedMimeType)) return true

  return Array.from(data.items ?? []).some((item) => normalizeMimeType(item.type) === normalizedMimeType)
}

export async function readClipboardString(
  data: ClipboardDataLike | null | undefined,
  mimeType: string
): Promise<string> {
  const normalizedMimeType = normalizeMimeType(mimeType)
  if (!normalizedMimeType || !data) return ''

  const directValue = safeGetData(data, normalizedMimeType)
  if (directValue) return directValue

  const matchingItem = Array.from(data.items ?? []).find(
    (item) =>
      normalizeMimeType(item.type) === normalizedMimeType &&
      (item.kind === undefined || item.kind === 'string') &&
      typeof item.getAsString === 'function'
  )
  if (!matchingItem?.getAsString) return ''

  return new Promise((resolve) => {
    try {
      matchingItem.getAsString?.((value) => resolve(value ?? ''))
    } catch {
      resolve('')
    }
  })
}

export async function readClipboardStringBestEffort(
  data: ClipboardDataLike | null | undefined,
  mimeType: string,
  clipboardApi?: ClipboardApiLike | null
): Promise<string> {
  const normalizedMimeType = normalizeMimeType(mimeType)
  if (!normalizedMimeType) return ''

  const directValue = await readClipboardString(data, normalizedMimeType)
  if (directValue) return directValue

  if (normalizedMimeType === 'text/plain') {
    const plainText = await readClipboardApiText(clipboardApi)
    if (plainText) return plainText
  }

  const clipboardApiValue = await readClipboardApiString(clipboardApi, normalizedMimeType)
  if (clipboardApiValue) return clipboardApiValue

  return ''
}

function normalizeMimeType(value?: string): string {
  return value?.trim().toLowerCase() ?? ''
}

function safeGetData(data: ClipboardDataLike, mimeType: string): string {
  try {
    return data.getData?.(mimeType) ?? ''
  } catch {
    return ''
  }
}

async function readClipboardApiText(clipboardApi?: ClipboardApiLike | null): Promise<string> {
  if (typeof clipboardApi?.readText !== 'function') return ''

  try {
    return (await clipboardApi.readText()) ?? ''
  } catch {
    return ''
  }
}

async function readClipboardApiString(
  clipboardApi: ClipboardApiLike | null | undefined,
  mimeType: string
): Promise<string> {
  if (typeof clipboardApi?.read !== 'function') return ''

  try {
    const items = await clipboardApi.read()
    for (const item of items) {
      const types = Array.from(item.types ?? []).map((type) => normalizeMimeType(type))
      if (!types.includes(mimeType) || typeof item.getType !== 'function') continue

      const blob = await item.getType(mimeType)
      const value = await blob?.text?.()
      if (value) return value
    }
  } catch {
    return ''
  }

  return ''
}
