import type { AIComposerSource, AISlashCommandContext } from './types.ts'
import { createAITemplateOpenDetail } from './templateLibrary.ts'
import type { EditorAIOpenDetail } from './events.ts'

export type AISlashCommandId = 'ai' | 'continue'

interface Translate {
  (key: string): string
}

export interface AISlashCommandEntry {
  id: AISlashCommandId
  label: string
  detail: string
  openDetail: EditorAIOpenDetail
}

export interface AISlashCommandQueryMatch {
  query: string
  from: number
  to: number
}

export interface AISlashCommandTriggerMatch extends AISlashCommandQueryMatch {
  entry: AISlashCommandEntry
}

const SLASH_COMMAND_SOURCE: AIComposerSource = 'slash-command'
const SLASH_COMMAND_QUERY_PATTERN = /(?:^|\s)\/([a-z0-9-]*)$/i

export function createAISlashCommandEntries(t: Translate): AISlashCommandEntry[] {
  return [
    {
      id: 'ai',
      label: 'ai',
      detail: t('ai.slash.askDetail'),
      openDetail: createAITemplateOpenDetail('ask', t, SLASH_COMMAND_SOURCE),
    },
    {
      id: 'continue',
      label: 'continue',
      detail: t('ai.slash.continueDetail'),
      openDetail: createAITemplateOpenDetail('continueWriting', t, SLASH_COMMAND_SOURCE),
    },
  ]
}

export function matchAISlashCommandQuery(textBeforeCursor: string): AISlashCommandQueryMatch | null {
  const match = textBeforeCursor.match(SLASH_COMMAND_QUERY_PATTERN)
  if (!match) return null

  const query = match[1].toLowerCase()
  const from = textBeforeCursor.length - query.length - 1

  return {
    query,
    from,
    to: textBeforeCursor.length,
  }
}

export function resolveAISlashCommandTrigger(
  textBeforeCursor: string,
  entries: readonly AISlashCommandEntry[]
): AISlashCommandTriggerMatch | null {
  const match = matchAISlashCommandQuery(textBeforeCursor)
  if (!match || match.query.length === 0) return null

  const entry = entries.find((candidate) => candidate.label.toLowerCase() === match.query)
  if (!entry) return null

  return {
    ...match,
    entry,
  }
}

export function buildAISlashCommandContext(docText: string, anchorOffset: number): AISlashCommandContext {
  const safeOffset = Math.max(0, Math.min(Math.trunc(anchorOffset), docText.length))
  const text = docText.slice(0, safeOffset)

  return {
    strategy: 'before-trigger',
    text,
    isEmpty: text.trim().length === 0,
  }
}
