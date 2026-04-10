import type {
  AIContextPacket,
  AIOutputTarget,
  AIRequestMessage,
  AIRunCompletionRequest,
} from './types.ts'

export function buildAIRequestMessages(request: Pick<AIRunCompletionRequest, 'prompt' | 'context'>): AIRequestMessage[] {
  const systemPrompt = buildAISystemPrompt(request.context)
  const userPrompt = buildAIUserPrompt(request.prompt, request.context)

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

export function normalizeAIDraftText(text: string, outputTarget: AIOutputTarget): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (outputTarget === 'chat-only') return trimmed

  const fencedMatch = trimmed.match(/^```(?:markdown|md)\s*\r?\n([\s\S]*?)\r?\n```$/iu)
  if (fencedMatch) return fencedMatch[1].trim()
  return trimmed
}

function buildAISystemPrompt(context: AIContextPacket): string {
  const lines = [
    'You are an AI writing assistant inside a Markdown editor.',
    'Preserve Markdown structure and formatting unless the user explicitly asks to change it.',
    'Do not wrap your response in ```markdown fences.',
    'Keep links, tables, headings, fenced code blocks, Mermaid blocks, math, and front matter safe.',
    context.explicitContextAttachments?.length
      ? 'Use only the explicit attached note, heading, and search context shown below. Do not assume any hidden workspace state.'
      : 'Do not assume access to any hidden workspace state beyond the visible attached context.',
    context.outputTarget === 'chat-only'
      ? 'When answering in chat-only mode, be concise and directly useful.'
      : context.outputTarget === 'new-note'
        ? 'Return only the Markdown content for a self-contained new note.'
      : 'Return only the content that should be inserted into the document.',
  ]

  switch (context.intent) {
    case 'ask':
      lines.push('Answer the user question clearly without rewriting unrelated content.')
      break
    case 'edit':
      lines.push('Edit only the intended target text or block and keep surrounding structure stable.')
      break
    case 'generate':
      lines.push('Generate content that fits naturally at the requested insertion point.')
      break
    case 'review':
      lines.push('Review the content and point out issues, risks, and concrete improvements.')
      break
  }

  if (context.documentLanguage !== 'mixed') {
    lines.push(`The document language is primarily ${context.documentLanguage}.`)
  }

  if (context.selectedTextRole === 'reference-only') {
    lines.push('Selected text is reference-only context and should not be treated as the rewrite target unless the user explicitly asks.')
  }

  return lines.join('\n')
}

function buildAIUserPrompt(prompt: string, context: AIContextPacket): string {
  const sections = [
    `User instruction:\n${prompt.trim()}`,
    `Intent: ${context.intent}`,
    `Scope: ${context.scope}`,
    `Output target: ${context.outputTarget}`,
  ]

  if (context.fileName) sections.push(`File: ${context.fileName}`)
  if (context.headingPath?.length) sections.push(`Heading path:\n${context.headingPath.join(' > ')}`)
  if (context.frontMatter) sections.push(`Front matter:\n${context.frontMatter}`)
  if (context.beforeText) sections.push(`Before context:\n${context.beforeText}`)
  if (context.selectedText) {
    sections.push(
      `Selected text (${context.selectedTextRole ?? 'transform-target'}):\n${context.selectedText}`
    )
  }
  if (context.currentBlock) sections.push(`Current block:\n${context.currentBlock}`)
  if (context.afterText) sections.push(`After context:\n${context.afterText}`)
  if (context.explicitContextAttachments?.length) {
    for (const attachment of context.explicitContextAttachments) {
      const descriptor =
        attachment.kind === 'note'
          ? 'Attached note'
          : attachment.kind === 'heading'
            ? 'Attached heading section'
            : 'Attached workspace search'
      const truncatedSuffix = attachment.truncated ? ' (truncated)' : ''
      const querySuffix = attachment.query ? ` [query: ${attachment.query}]` : ''

      sections.push(
        `${descriptor}${truncatedSuffix}: ${attachment.label}${querySuffix}\n${attachment.content}`
      )
    }
  }

  return sections.join('\n\n')
}
