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
  const normalized = fencedMatch ? fencedMatch[1].trim() : trimmed
  return normalizeMarkdownDraftText(normalized)
}

function buildAISystemPrompt(context: AIContextPacket): string {
  void context

  const lines = [
    'You are an AI writing assistant inside a Markdown editor.',
    'Preserve Markdown structure and formatting unless the user explicitly asks to change it.',
    'Return standards-compliant Markdown whenever your response is meant to be inserted into or read as Markdown content.',
    'Use valid Markdown block syntax, including required spacing for ATX headings.',
    'Do not wrap your response in ```markdown fences.',
    'Treat XML-like context tags as authoritative context boundaries.',
    'Keep links, tables, headings, fenced code blocks, Mermaid blocks, math, and front matter safe.',
  ]

  return lines.join('\n')
}

function buildAIUserPrompt(prompt: string, context: AIContextPacket): string {
  const sections = [`User instruction:\n${prompt.trim()}`]
  const inputSection = buildAIInputSection(context)
  if (inputSection) sections.push(inputSection)

  return sections.join('\n\n')
}

function buildAIInputSection(context: AIContextPacket): string | null {
  if (context.selectedText) {
    return [
      'Input source: selected-text',
      `Input role: ${context.selectedTextRole ?? 'transform-target'}`,
      '<input_content>',
      context.selectedText,
      '</input_content>',
    ].join('\n')
  }

  if (context.slashCommandContext) {
    return [
      'Input source: slash-prefix',
      'Input role: context-before-cursor',
      '<input_content>',
      context.slashCommandContext,
      '</input_content>',
    ].join('\n')
  }

  return null
}

function normalizeMarkdownDraftText(text: string): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/u)
  const normalizedLines: string[] = []
  let activeFence: { marker: '`' | '~'; length: number } | null = null

  for (const line of lines) {
    const fence = parseMarkdownFence(line)

    if (activeFence) {
      normalizedLines.push(line)
      if (
        fence &&
        fence.marker === activeFence.marker &&
        fence.length >= activeFence.length &&
        fence.rest.trim().length === 0
      ) {
        activeFence = null
      }
      continue
    }

    if (fence) {
      activeFence = { marker: fence.marker, length: fence.length }
      normalizedLines.push(line)
      continue
    }

    normalizedLines.push(normalizeMarkdownHeadingSpacing(line))
  }

  return normalizedLines.join(newline)
}

function parseMarkdownFence(line: string): { marker: '`' | '~'; length: number; rest: string } | null {
  const match = line.match(/^\s{0,3}([`~]{3,})(.*)$/u)
  if (!match) return null

  const fence = match[1] ?? ''
  const marker = fence[0]
  if ((marker !== '`' && marker !== '~') || !fence.split('').every((char) => char === marker)) {
    return null
  }

  return {
    marker,
    length: fence.length,
    rest: match[2] ?? '',
  }
}

function normalizeMarkdownHeadingSpacing(line: string): string {
  return line.replace(/^(\s{0,3})(#{1,6})(?!#)(\S.*)$/u, '$1$2 $3')
}
