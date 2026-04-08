export type FocusWidthMode = 'narrow' | 'comfortable' | 'wide' | 'custom'

export const FOCUS_WIDTH_PRESET_VALUES = {
  narrow: 1280,
  comfortable: 1600,
  wide: 1920,
} as const

export const FOCUS_WIDTH_CUSTOM_MIN = 840
export const FOCUS_WIDTH_CUSTOM_MAX = 2160
export const FOCUS_WIDTH_CUSTOM_STEP = 20

export function clampFocusWidthPx(px: number): number {
  const snapped = Math.round(px / FOCUS_WIDTH_CUSTOM_STEP) * FOCUS_WIDTH_CUSTOM_STEP
  return Math.min(FOCUS_WIDTH_CUSTOM_MAX, Math.max(FOCUS_WIDTH_CUSTOM_MIN, snapped))
}

export function resolveFocusWidthPx(mode: FocusWidthMode, customPx: number): number {
  switch (mode) {
    case 'narrow':
      return FOCUS_WIDTH_PRESET_VALUES.narrow
    case 'comfortable':
      return FOCUS_WIDTH_PRESET_VALUES.comfortable
    case 'wide':
      return FOCUS_WIDTH_PRESET_VALUES.wide
    case 'custom':
    default:
      return clampFocusWidthPx(customPx)
  }
}

export function resolveFocusInlinePaddingPx(widthPx: number): number {
  return Math.min(128, Math.max(56, Math.round(widthPx * 0.1)))
}
