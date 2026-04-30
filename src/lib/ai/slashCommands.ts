import type { AIComposerSource } from './types.ts'
import { createAITemplateOpenDetail } from './templateLibrary.ts'
import type { EditorAIOpenDetail } from './events.ts'

export type AISlashCommandId = 'ai' | 'continue' | 'rewrite' | 'translate' | 'summarize' | 'explain'

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
      id: 'continue',
      label: 'continue',
      detail: t('ai.slash.continueDetail'),
      openDetail: createAITemplateOpenDetail('continueWriting', t, SLASH_COMMAND_SOURCE),
    },
    {
      id: 'ai',
      label: 'ai',
      detail: t('ai.slash.askDetail'),
      openDetail: createAITemplateOpenDetail('ask', t, SLASH_COMMAND_SOURCE),
    },
    {
      id: 'rewrite',
      label: 'rewrite',
      detail: t('ai.slash.rewriteDetail'),
      openDetail: createAITemplateOpenDetail('rewrite', t, SLASH_COMMAND_SOURCE),
    },
    {
      id: 'translate',
      label: 'translate',
      detail: t('ai.slash.translateDetail'),
      openDetail: createAITemplateOpenDetail('translate', t, SLASH_COMMAND_SOURCE),
    },
    {
      id: 'summarize',
      label: 'summarize',
      detail: t('ai.slash.summarizeDetail'),
      openDetail: createAITemplateOpenDetail('summarize', t, SLASH_COMMAND_SOURCE),
    },
    {
      id: 'explain',
      label: 'explain',
      detail: t('ai.slash.explainDetail'),
      openDetail: createAITemplateOpenDetail('explain', t, SLASH_COMMAND_SOURCE),
    },
  ]
}

export function normalizeAISlashCommandContext(value: string): string | undefined {
  const context = value.replace(/<br\s*\/?>/giu, '\n').trim()
  return context.length > 0 ? context : undefined
}

export function buildAISlashCommandContext(textBeforeTrigger: string): string | undefined {
  return normalizeAISlashCommandContext(textBeforeTrigger)
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
