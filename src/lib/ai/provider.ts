import type { AIProviderConfig } from './types.ts'

export const OPENAI_COMPATIBLE_PROVIDER = 'openai-compatible' as const

export function createDefaultAIProviderConfig(): AIProviderConfig {
  return {
    provider: OPENAI_COMPATIBLE_PROVIDER,
    baseUrl: '',
    model: '',
    project: '',
  }
}

export function normalizeAIProviderConfig(config: AIProviderConfig): AIProviderConfig {
  const provider = config.provider
  if (provider !== OPENAI_COMPATIBLE_PROVIDER) {
    throw new Error(`Unsupported AI provider: ${provider}`)
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const model = config.model.trim()
  if (!model) throw new Error('AI model is required.')
  const project = config.project.trim()

  return {
    provider,
    baseUrl,
    model,
    project,
  }
}

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/u, '')
  if (!trimmed) throw new Error('AI base URL is required.')

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('AI base URL must be a valid HTTP or HTTPS URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('AI base URL must use HTTP or HTTPS.')
  }

  return parsed.toString().replace(/\/+$/u, '')
}
