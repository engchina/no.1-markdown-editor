import { loadAIProviderState, runAICompletion } from './client.ts'
import { resolveAIHistoryProviderRerankPolicy } from './providerHistoryBudget.ts'
import type {
  AIContextPacket,
  AIHistoryProviderRerankBudget,
  AIRequestMessage,
} from './types.ts'
import type {
  AIHistoryRetrievalCandidate,
  AIHistoryRetrievalMatch,
} from './historyRetrieval.ts'

const PROVIDER_HISTORY_RERANK_MARKER = '[ai-history-ranking]'

interface AIProviderHistoryRerankResult {
  id: string
  score: number
  rationale: string
}

interface AIProviderHistoryRerankResponse {
  results: AIProviderHistoryRerankResult[]
}

export interface AIHistoryProviderRerankPayloadCandidate {
  id: string
  documentName: string
  source: AIHistoryRetrievalCandidate['source']
  intent: AIHistoryRetrievalCandidate['intent']
  outputTarget: AIHistoryRetrievalCandidate['outputTarget']
  prompt: string
  resultPreview?: string | null
  errorMessage?: string | null
  pinned: boolean
}

export interface AIHistoryProviderRerankPayload {
  query: string
  budget: AIHistoryProviderRerankBudget
  candidates: AIHistoryProviderRerankPayloadCandidate[]
}

export interface AIProviderHistoryRerankRunResult<T extends AIHistoryRetrievalCandidate = AIHistoryRetrievalCandidate> {
  matches: AIHistoryRetrievalMatch<T>[]
  providerModel: string | null
  sentCount: number
}

export async function rerankAIHistoryCandidatesWithProvider<T extends AIHistoryRetrievalCandidate>(args: {
  query: string
  candidates: readonly T[]
  activeDocumentName: string
  budget: AIHistoryProviderRerankBudget
}): Promise<AIProviderHistoryRerankRunResult<T>> {
  const query = args.query.trim()
  if (!query) return { matches: [], providerModel: null, sentCount: 0 }
  if (args.candidates.length === 0) return { matches: [], providerModel: null, sentCount: 0 }
  const policy = resolveAIHistoryProviderRerankPolicy(args.budget)
  const visibleCandidates = args.candidates.slice(0, policy.maxCandidates)
  if (visibleCandidates.length === 0) return { matches: [], providerModel: null, sentCount: 0 }

  const providerState = await loadAIProviderState()
  if (
    !providerState.config?.baseUrl ||
    !providerState.config?.model ||
    providerState.hasApiKey !== true
  ) {
    throw new Error('AI provider settings are incomplete.')
  }

  const requestId = `ai-history-rerank-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const messages = buildAIHistoryProviderRerankMessages({
    query,
    candidates: visibleCandidates,
    budget: args.budget,
  })
  const context = buildAIHistoryProviderRerankContext(args.activeDocumentName)

  const response = await runAICompletion({
    requestId,
    intent: 'review',
    scope: 'document',
    outputTarget: 'chat-only',
    prompt: buildAIHistoryProviderRerankPrompt({ query, candidates: visibleCandidates, budget: args.budget }),
    context,
    messages,
  })

  const parsed = parseAIHistoryProviderRerankResponse(response.text)
  const candidatesById = new Map(visibleCandidates.map((candidate) => [candidate.id, candidate] as const))

  const matches: AIHistoryRetrievalMatch<T>[] = []
  for (const item of parsed.results) {
    const candidate = candidatesById.get(item.id)
    if (!candidate) continue
    matches.push({
      candidate,
      score: item.score,
      matchKind: 'provider',
      matchedTerms: [],
      explanation: item.rationale,
    })
  }

  return {
    matches,
    providerModel: response.model,
    sentCount: visibleCandidates.length,
  }
}

export function buildAIHistoryProviderRerankPrompt<T extends AIHistoryRetrievalCandidate>(args: {
  query: string
  candidates: readonly T[]
  budget: AIHistoryProviderRerankBudget
}) {
  const policy = resolveAIHistoryProviderRerankPolicy(args.budget)
  const payload = buildAIHistoryProviderRerankPayload(args)

  return [
    PROVIDER_HISTORY_RERANK_MARKER,
    'Return JSON only.',
    'Rank the visible AI history candidates by relevance to the query.',
    'Prefer semantic meaning, document intent, and useful prior results over literal token overlap.',
    policy.includeResultPreview
      ? 'Result previews are included when available and should influence usefulness.'
      : 'Only prompts and visible metadata are included; do not assume hidden result details.',
    'Return: {"results":[{"id":"candidate-id","score":0-100,"rationale":"short reason"}]}',
    'Rationale must stay under 80 characters.',
    '',
    'CANDIDATES_JSON:',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

export function buildAIHistoryProviderRerankMessages<T extends AIHistoryRetrievalCandidate>(args: {
  query: string
  candidates: readonly T[]
  budget: AIHistoryProviderRerankBudget
}): AIRequestMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You rank prior AI history entries for a Markdown editor.',
        'Return strict JSON only. Do not wrap the response in markdown fences.',
        'Use semantic intent matching, multilingual equivalence, and practical usefulness.',
        'Do not invent ids or candidates that were not provided.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: buildAIHistoryProviderRerankPrompt(args),
    },
  ]
}

export function buildAIHistoryProviderRerankPayload<T extends AIHistoryRetrievalCandidate>(args: {
  query: string
  candidates: readonly T[]
  budget: AIHistoryProviderRerankBudget
}): AIHistoryProviderRerankPayload {
  const policy = resolveAIHistoryProviderRerankPolicy(args.budget)

  return {
    query: args.query.trim(),
    budget: args.budget,
    candidates: args.candidates.map((candidate) => ({
      id: candidate.id,
      documentName: candidate.documentName,
      source: candidate.source,
      intent: candidate.intent,
      outputTarget: candidate.outputTarget,
      prompt: candidate.prompt,
      ...(policy.includeResultPreview ? { resultPreview: candidate.resultPreview } : {}),
      ...(policy.includeErrorMessage ? { errorMessage: candidate.errorMessage } : {}),
      pinned: candidate.pinned,
    })),
  }
}

export function parseAIHistoryProviderRerankResponse(text: string): AIProviderHistoryRerankResponse {
  const payload = extractJsonObject(text)
  const parsed = JSON.parse(payload) as Partial<AIProviderHistoryRerankResponse>
  if (!Array.isArray(parsed.results)) {
    throw new Error('Provider history rerank response did not include a results array.')
  }

  const results = parsed.results
    .map((item) => normalizeProviderRerankItem(item))
    .filter((item): item is AIProviderHistoryRerankResult => item !== null)

  if (results.length === 0) {
    throw new Error('Provider history rerank response did not include any valid results.')
  }

  return { results }
}

function normalizeProviderRerankItem(value: unknown): AIProviderHistoryRerankResult | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<AIProviderHistoryRerankResult>
  if (typeof candidate.id !== 'string' || typeof candidate.rationale !== 'string') return null
  const score = typeof candidate.score === 'number' ? candidate.score : Number(candidate.score)
  if (!Number.isFinite(score)) return null

  return {
    id: candidate.id,
    score: Math.max(0, Math.min(100, Math.round(score))),
    rationale: candidate.rationale.trim().slice(0, 120),
  }
}

function buildAIHistoryProviderRerankContext(activeDocumentName: string): AIContextPacket {
  return {
    tabId: 'ai-history-rerank',
    tabPath: null,
    fileName: activeDocumentName || 'AI History',
    documentLanguage: 'mixed',
    intent: 'review',
    scope: 'document',
    outputTarget: 'chat-only',
  }
}

function extractJsonObject(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)
  const candidate = fenced ? fenced[1].trim() : trimmed
  if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate

  const startIndex = candidate.indexOf('{')
  const endIndex = candidate.lastIndexOf('}')
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('Provider history rerank response did not contain JSON.')
  }
  return candidate.slice(startIndex, endIndex + 1)
}
