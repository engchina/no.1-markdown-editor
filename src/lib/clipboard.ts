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
