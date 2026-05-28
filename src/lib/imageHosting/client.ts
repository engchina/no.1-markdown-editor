import { invoke } from '@tauri-apps/api/core'
import type {
  ImageHostingConfig,
  ImageHostingState,
  ImageHostingUploadResult,
} from './types.ts'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function isImageHostingDesktopAvailable(): boolean {
  return isTauri
}

function assertDesktopAvailable(): void {
  if (!isTauri) {
    throw new Error('Image hosting is only available in the desktop app')
  }
}

export async function loadImageHostingState(): Promise<ImageHostingState> {
  assertDesktopAvailable()
  return invoke<ImageHostingState>('image_hosting_load_state')
}

export async function saveImageHostingConfig(
  config: ImageHostingConfig
): Promise<ImageHostingConfig> {
  assertDesktopAvailable()
  return invoke<ImageHostingConfig>('image_hosting_save_config', { config })
}

export async function storeImageHostingPat(pat: string): Promise<void> {
  assertDesktopAvailable()
  await invoke('image_hosting_store_pat', { pat })
}

export async function clearImageHostingPat(): Promise<void> {
  assertDesktopAvailable()
  await invoke('image_hosting_clear_pat')
}

export async function verifyImageHosting(): Promise<string> {
  assertDesktopAvailable()
  return invoke<string>('image_hosting_verify')
}

export async function uploadImageToHosting(
  localPath: string,
  remoteFilename: string
): Promise<ImageHostingUploadResult> {
  assertDesktopAvailable()
  return invoke<ImageHostingUploadResult>('image_hosting_upload', {
    localPath,
    remoteFilename,
  })
}
