import type { AIContextPacket } from './types.ts'

export interface AIContextChipModel {
  kind: 'selection' | 'block' | 'heading' | 'frontMatter' | 'note' | 'search'
  value?: string
}

export function buildAIContextChipModels(context: AIContextPacket | null): AIContextChipModel[] {
  if (!context) return []

  const chips: AIContextChipModel[] = []
  if (context.selectedText) chips.push({ kind: 'selection' })
  if (context.currentBlock) chips.push({ kind: 'block' })
  if (context.headingPath?.length) {
    chips.push({
      kind: 'heading',
      value: context.headingPath[context.headingPath.length - 1],
    })
  }
  if (context.frontMatter) chips.push({ kind: 'frontMatter' })
  for (const attachment of context.explicitContextAttachments ?? []) {
    if (attachment.kind === 'note') {
      chips.push({
        kind: 'note',
        value: attachment.label,
      })
    }

    if (attachment.kind === 'search') {
      chips.push({
        kind: 'search',
        value: attachment.label,
      })
    }
  }

  return chips
}
