import type {
  AIComposerSource,
  AIContextPacket,
  AIIntent,
  AIOutputTarget,
  AIRequestState,
} from './types.ts'

export interface AIExplainDetails {
  intent: AIIntent
  outputTarget: AIOutputTarget
  requestState: AIRequestState
  source: AIComposerSource
  fileName?: string
  documentLanguage?: string
  selectedTextRole?: string
  headingPath?: string
  explicitContext?: string
  provider?: string
  model?: string
  threadId?: string
}

export function buildAIExplainDetails(params: {
  context: AIContextPacket | null
  intent: AIIntent
  outputTarget: AIOutputTarget
  requestState: AIRequestState
  source: AIComposerSource
  provider?: string
  model?: string
  threadId?: string | null
}): AIExplainDetails {
  const { context } = params

  return {
    intent: params.intent,
    outputTarget: params.outputTarget,
    requestState: params.requestState,
    source: params.source,
    fileName: context?.fileName,
    documentLanguage: context?.documentLanguage,
    selectedTextRole: context?.selectedTextRole,
    headingPath: context?.headingPath?.join(' > '),
    explicitContext: context?.explicitContextAttachments
      ?.map((attachment) => `@${attachment.kind} ${attachment.label}`)
      .join(' · '),
    provider: params.provider,
    model: params.model,
    threadId: params.threadId ?? undefined,
  }
}
