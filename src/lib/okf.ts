import type { FrontMatterValue } from './frontMatter.ts'
import type { WorkspaceIndexDocument, WorkspaceIndexSnapshot } from './workspaceIndex/types.ts'

export type OkfWorkspaceMode = 'auto' | 'enabled' | 'disabled'
export type OkfIssueSeverity = 'error' | 'suggestion' | 'warning'

export interface OkfIssue {
  code: string
  severity: OkfIssueSeverity
  path: string
  line: number
  message: string
}

export interface OkfBundleProfile {
  enabled: boolean
  mode: OkfWorkspaceMode
  source: 'declaration' | 'manual' | 'disabled' | 'none'
  version: string | null
  issues: OkfIssue[]
  errorCount: number
  suggestionCount: number
}

const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/u
const LOG_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

export function buildOkfBundleProfile(
  snapshot: WorkspaceIndexSnapshot | null,
  mode: OkfWorkspaceMode
): OkfBundleProfile {
  if (!snapshot) return emptyProfile(mode)

  const rootIndex = findRootDocument(snapshot, 'index.md')
  const declaredVersion = rootIndex?.okf?.okfVersion
  const hasDeclaration = declaredVersion !== undefined
  const version = typeof declaredVersion === 'string' && declaredVersion.trim()
    ? declaredVersion.trim()
    : null
  const enabled = mode === 'enabled' || (mode === 'auto' && hasDeclaration)
  const source = mode === 'disabled'
    ? 'disabled'
    : mode === 'enabled'
      ? 'manual'
      : hasDeclaration
        ? 'declaration'
        : 'none'

  if (!enabled) {
    return { ...emptyProfile(mode), source, version }
  }

  const issues: OkfIssue[] = []
  if (hasDeclaration && version !== '0.1') {
    issues.push(issue(
      'unsupported-version',
      'warning',
      rootIndex?.path ?? snapshot.rootPath,
      getFrontMatterFieldLine(rootIndex, 'okf_version'),
      version
        ? `OKF version ${version} is not recognized; validating with v0.1 rules.`
        : 'okf_version must be the string "0.1"; validating with v0.1 rules.'
    ))
  }

  for (const document of snapshot.documents) {
    const reservedName = document.name.toLowerCase()
    if (reservedName === 'index.md') {
      validateIndexDocument(document, snapshot, issues)
      continue
    }
    if (reservedName === 'log.md') {
      validateLogDocument(document, issues)
      continue
    }
    if (!isMarkdownDocument(document.name)) continue
    validateConceptDocument(document, issues)
  }

  issues.sort((left, right) => {
    if (left.path !== right.path) return left.path.localeCompare(right.path)
    if (left.line !== right.line) return left.line - right.line
    return left.code.localeCompare(right.code)
  })

  return {
    enabled,
    mode,
    source,
    version: version ?? '0.1',
    issues,
    errorCount: issues.filter((entry) => entry.severity === 'error').length,
    suggestionCount: issues.filter((entry) => entry.severity !== 'error').length,
  }
}

export function getOkfIssuesForPath(profile: OkfBundleProfile, path: string): OkfIssue[] {
  const normalizedPath = normalizePath(path)
  return profile.issues.filter((entry) => normalizePath(entry.path) === normalizedPath)
}

function validateConceptDocument(document: WorkspaceIndexDocument, issues: OkfIssue[]): void {
  const status = document.frontMatter?.status ?? (document.frontMatter ? 'valid' : 'absent')
  if (status !== 'valid') {
    const message = status === 'absent'
      ? 'Concept documents require YAML front matter.'
      : status === 'unclosed'
        ? 'YAML front matter is not closed.'
        : status === 'empty'
          ? 'Concept front matter cannot be empty.'
          : 'Concept front matter must be a valid YAML mapping.'
    issues.push(issue(`frontmatter-${status}`, 'error', document.path, 1, message))
    return
  }

  if (document.frontMatter?.closingMarker !== '---') {
    issues.push(issue(
      'frontmatter-closing-marker',
      'error',
      document.path,
      Math.max((document.frontMatter?.raw.match(/\r\n|\n|\r/gu)?.length ?? 0) + 3, 3),
      'OKF concept front matter must close with ---.'
    ))
  }

  const type = document.okf?.type
  if (typeof type !== 'string' || !type.trim()) {
    issues.push(issue('type-required', 'error', document.path, getFrontMatterFieldLine(document, 'type'), 'type must be a non-empty string.'))
  }

  suggestMissingField(document, issues, 'title')
  suggestMissingField(document, issues, 'description')
  suggestMissingField(document, issues, 'timestamp')

  const description = document.okf?.description
  if (description !== undefined && (typeof description !== 'string' || /\r|\n/u.test(description))) {
    issues.push(issue('description-format', 'error', document.path, getFrontMatterFieldLine(document, 'description'), 'description must be a single-line string.'))
  }

  const resource = document.okf?.resource
  if (resource !== undefined && (typeof resource !== 'string' || !isAbsoluteUri(resource))) {
    issues.push(issue('resource-format', 'error', document.path, getFrontMatterFieldLine(document, 'resource'), 'resource must be an absolute URI.'))
  }

  const tags = document.okf?.tags
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
    issues.push(issue('tags-format', 'error', document.path, getFrontMatterFieldLine(document, 'tags'), 'tags must be an array of strings.'))
  }

  const timestamp = document.okf?.timestamp
  if (timestamp !== undefined && (typeof timestamp !== 'string' || !isIsoDateTime(timestamp))) {
    issues.push(issue('timestamp-format', 'error', document.path, getFrontMatterFieldLine(document, 'timestamp'), 'timestamp must be an ISO 8601 datetime.'))
  }
}

function validateIndexDocument(
  document: WorkspaceIndexDocument,
  snapshot: WorkspaceIndexSnapshot,
  issues: OkfIssue[]
): void {
  if (document.frontMatter && document.frontMatter.status !== 'valid') {
    issues.push(issue('index-frontmatter-invalid', 'error', document.path, 1, 'index.md front matter must be a valid YAML mapping.'))
  }
  if (document.frontMatter?.status === 'valid' && document.frontMatter.closingMarker !== '---') {
    issues.push(issue('frontmatter-closing-marker', 'error', document.path, 1, 'OKF front matter must close with ---.'))
  }
  if (!isRootDocument(snapshot, document) && document.frontMatter) {
    issues.push(issue('nested-index-frontmatter', 'error', document.path, 1, 'Only the bundle root index.md may contain front matter.'))
  }

  const links = document.links.filter((link) => link.kind === 'markdown' && link.local)
  if (links.length === 0 && document.headings.length === 0) return

  for (const heading of document.headings) {
    if (heading.level !== 1 && heading.level !== 2) {
      issues.push(issue('index-heading-level', 'error', document.path, heading.line, 'OKF index groups must use level-two headings.'))
    }
  }

  for (const link of links) {
    if (!link.listItem) {
      issues.push(issue('index-link-list', 'error', document.path, link.line, 'OKF index document links must be Markdown list items.'))
    }
  }
}

function validateLogDocument(document: WorkspaceIndexDocument, issues: OkfIssue[]): void {
  if (document.frontMatter) {
    issues.push(issue('log-frontmatter', 'error', document.path, 1, 'log.md must not contain front matter.'))
  }

  let previousDate: string | null = null
  for (const heading of document.headings) {
    if (heading.level !== 2 || !LOG_DATE_PATTERN.test(heading.text) || !isCalendarDate(heading.text)) {
      issues.push(issue('log-date-heading', 'error', document.path, heading.line, 'log.md entries must use ## YYYY-MM-DD headings.'))
      continue
    }
    if (previousDate && heading.text > previousDate) {
      issues.push(issue('log-date-order', 'error', document.path, heading.line, 'log.md date headings must be in descending order.'))
    }
    previousDate = heading.text
  }
}

function suggestMissingField(
  document: WorkspaceIndexDocument,
  issues: OkfIssue[],
  field: 'title' | 'description' | 'timestamp'
): void {
  if (document.okf?.[field] !== undefined) return
  issues.push(issue(`${field}-recommended`, 'suggestion', document.path, 2, `${field} is recommended for OKF concept documents.`))
}

function getFrontMatterFieldLine(document: WorkspaceIndexDocument | null | undefined, field: string): number {
  const raw = document?.frontMatter?.raw
  if (!raw) return 2
  const lines = raw.split(/\r\n|\n|\r/u)
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`^\\s*${escapedField}\\s*:`, 'iu')
  const index = lines.findIndex((line) => pattern.test(line))
  return index === -1 ? 2 : index + 2
}

function findRootDocument(snapshot: WorkspaceIndexSnapshot, name: string): WorkspaceIndexDocument | null {
  const rootPath = normalizePath(snapshot.rootPath)
  return snapshot.documents.find((document) => normalizePath(document.path) === `${rootPath}/${name}`) ?? null
}

function isRootDocument(snapshot: WorkspaceIndexSnapshot, document: WorkspaceIndexDocument): boolean {
  return normalizePath(document.path) === `${normalizePath(snapshot.rootPath)}/${document.name}`
}

function isMarkdownDocument(name: string): boolean {
  return /\.md$/iu.test(name)
}

function isAbsoluteUri(value: string): boolean {
  const trimmed = value.trim()
  if (!/^[A-Za-z][A-Za-z\d+.-]*:/u.test(trimmed)) return false
  try {
    new URL(trimmed)
    return true
  } catch {
    return false
  }
}

function isIsoDateTime(value: string): boolean {
  return ISO_DATETIME_PATTERN.test(value.trim()) && !Number.isNaN(Date.parse(value))
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

function issue(
  code: string,
  severity: OkfIssueSeverity,
  path: string,
  line: number,
  message: string
): OkfIssue {
  return { code, severity, path, line: Math.max(line, 1), message }
}

function emptyProfile(mode: OkfWorkspaceMode): OkfBundleProfile {
  return {
    enabled: false,
    mode,
    source: mode === 'disabled' ? 'disabled' : 'none',
    version: null,
    issues: [],
    errorCount: 0,
    suggestionCount: 0,
  }
}

export function isOkfScalar(value: FrontMatterValue | undefined): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}
