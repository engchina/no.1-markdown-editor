type ShortcutEvent = Pick<
  KeyboardEvent,
  'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
> & {
  isComposing?: boolean
}

export type PrimaryModifierEvent = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false

  // `navigator.userAgent` is reliable in both Tauri WebViews (WKWebView reports
  // "Macintosh", WebView2 reports "Windows") and the dev:web browser preview.
  // `navigator.platform` is deprecated, so we no longer consult it.
  return /mac/i.test(navigator.userAgent)
}

export function hasPrimaryModifier(event: PrimaryModifierEvent, mac = isMacPlatform()): boolean {
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

export function getPrimaryModifierLabel(mac = isMacPlatform()): string {
  return mac ? '⌘' : 'Ctrl'
}

export function formatPrimaryShortcut(
  key: string,
  options: {
    alt?: boolean
    shift?: boolean
  } = {},
  mac = isMacPlatform()
): string {
  if (mac) {
    return `${getPrimaryModifierLabel(mac)}${options.alt ? '⌥' : ''}${options.shift ? '⇧' : ''}${key}`
  }

  return [getPrimaryModifierLabel(mac), options.alt ? 'Alt' : '', options.shift ? 'Shift' : '', key]
    .filter(Boolean)
    .join('+')
}

export function matchesPrimaryShortcut(
  event: ShortcutEvent,
  options: {
    key?: string
    code?: string
    shift?: boolean
    alt?: boolean
  },
  mac = isMacPlatform()
): boolean {
  // No isComposing guard: this only matches primary-modifier (Cmd/Ctrl) combos,
  // which never take part in IME composition. On macOS + CJK IME isComposing can
  // be true for them and would silently swallow the shortcut.
  if (!hasPrimaryModifier(event, mac)) return false
  if ((options.shift ?? false) !== event.shiftKey) return false
  if ((options.alt ?? false) !== event.altKey) return false

  if (options.code) {
    return event.code === options.code
  }

  if (options.key) {
    return event.key.toLowerCase() === options.key.toLowerCase()
  }

  return false
}

export type ZoomShortcut = 'in' | 'out' | 'reset' | null

// Resolve a primary-modifier zoom shortcut from a keydown event.
//
// Matches by physical key (event.code) + shiftKey rather than event.key,
// because on macOS WebKit holding Command makes event.key report the UNSHIFTED
// base character (Shift+= yields '=' not '+'), and JIS keyboards put '+' on the
// Semicolon key and '=' on the Minus key. Relying on event.key === '+'/'=' there
// silently broke zoom-in (and Shift+Minus fell through to zoom-out). event.key
// is kept only as a fallback for layouts that report it correctly.
export function matchZoomShortcut(event: ShortcutEvent, mac = isMacPlatform()): ZoomShortcut {
  if (event.altKey || !hasPrimaryModifier(event, mac)) return null

  const zoomIn =
    event.code === 'Equal' || // US '='/'+' key
    event.code === 'NumpadAdd' || // numeric keypad '+'
    // ponytail: no async keyboard-layout lookup; Shift+Minus doubles as JIS '=' until a real conflict appears.
    ((event.code === 'Semicolon' || event.code === 'Minus') && event.shiftKey) ||
    event.key === '+' ||
    event.key === '='
  if (zoomIn) return 'in'

  const zoomOut =
    event.code === 'NumpadSubtract' ||
    (event.code === 'Minus' && !event.shiftKey) || // '-' without Shift
    event.key === '-'
  if (zoomOut) return 'out'

  if (event.code === 'Digit0' || event.code === 'Numpad0' || event.key === '0') return 'reset'

  return null
}
