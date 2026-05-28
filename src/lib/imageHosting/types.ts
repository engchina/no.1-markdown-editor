export interface ImageHostingConfig {
  enabled: boolean
  owner: string
  repo: string
  branch: string
  directory: string
  commitMessageTemplate: string
}

export interface ImageHostingState {
  config: ImageHostingConfig
  hasPat: boolean
}

export interface ImageHostingUploadResult {
  url: string
  rawUrl: string
  remotePath: string
  commitSha: string | null
}

export function createDefaultImageHostingConfig(): ImageHostingConfig {
  return {
    enabled: false,
    owner: '',
    repo: '',
    branch: 'main',
    directory: 'images',
    commitMessageTemplate: 'Upload image: {filename}',
  }
}

export function isImageHostingReady(state: ImageHostingState | null): boolean {
  if (!state) return false
  const { config, hasPat } = state
  return (
    config.enabled &&
    hasPat &&
    config.owner.trim().length > 0 &&
    config.repo.trim().length > 0
  )
}
