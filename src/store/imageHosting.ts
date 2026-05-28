import { create } from 'zustand'
import {
  clearImageHostingPat,
  isImageHostingDesktopAvailable,
  loadImageHostingState,
  saveImageHostingConfig,
  storeImageHostingPat,
  verifyImageHosting,
} from '../lib/imageHosting/client'
import {
  createDefaultImageHostingConfig,
  type ImageHostingConfig,
  type ImageHostingState,
} from '../lib/imageHosting/types'

interface ImageHostingStoreState {
  state: ImageHostingState | null
  loading: boolean
  saving: boolean
  verifying: boolean
  error: string | null
  lastVerifiedAt: number | null
  lastVerifiedRepo: string | null
  load: () => Promise<void>
  saveConfig: (config: ImageHostingConfig) => Promise<void>
  savePat: (pat: string) => Promise<void>
  clearPat: () => Promise<void>
  verify: () => Promise<void>
  clearError: () => void
}

export const useImageHostingStore = create<ImageHostingStoreState>((set, get) => ({
  state: null,
  loading: false,
  saving: false,
  verifying: false,
  error: null,
  lastVerifiedAt: null,
  lastVerifiedRepo: null,

  load: async () => {
    if (!isImageHostingDesktopAvailable()) {
      set({
        state: { config: createDefaultImageHostingConfig(), hasPat: false },
        loading: false,
        error: null,
      })
      return
    }

    set({ loading: true, error: null })
    try {
      const state = await loadImageHostingState()
      set({ state, loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  saveConfig: async (config) => {
    if (!isImageHostingDesktopAvailable()) {
      set({
        state: { config, hasPat: get().state?.hasPat ?? false },
      })
      return
    }

    set({ saving: true, error: null })
    try {
      const normalized = await saveImageHostingConfig(config)
      const hasPat = get().state?.hasPat ?? false
      set({ saving: false, state: { config: normalized, hasPat } })
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  savePat: async (pat) => {
    if (!isImageHostingDesktopAvailable()) return

    set({ saving: true, error: null })
    try {
      await storeImageHostingPat(pat)
      const config = get().state?.config ?? createDefaultImageHostingConfig()
      set({ saving: false, state: { config, hasPat: true } })
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  clearPat: async () => {
    if (!isImageHostingDesktopAvailable()) return

    set({ saving: true, error: null })
    try {
      await clearImageHostingPat()
      const config = get().state?.config ?? createDefaultImageHostingConfig()
      set({
        saving: false,
        state: { config, hasPat: false },
        lastVerifiedAt: null,
        lastVerifiedRepo: null,
      })
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  verify: async () => {
    if (!isImageHostingDesktopAvailable()) return

    set({ verifying: true, error: null })
    try {
      const repo = await verifyImageHosting()
      set({
        verifying: false,
        lastVerifiedAt: Date.now(),
        lastVerifiedRepo: repo,
      })
    } catch (error) {
      set({
        verifying: false,
        error: error instanceof Error ? error.message : String(error),
        lastVerifiedAt: null,
        lastVerifiedRepo: null,
      })
      throw error
    }
  },

  clearError: () => set({ error: null }),
}))
