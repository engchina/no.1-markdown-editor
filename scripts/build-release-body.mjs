import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const RELEASE_NOTES_DRAFT_PATH = 'docs/release-notes-draft.md'
const CHANGELOG_PATH = 'CHANGELOG.md'

// Permanent note appended to every GitHub release body. The macOS build is
// ad-hoc signed and unnotarized, so Gatekeeper can block the initial install.
// Later releases use Tauri's independently signed in-app updater and do not
// send existing users back through the browser/DMG install path.
export const MACOS_FIRST_LAUNCH_NOTE = [
  '## macOS: Initial Install or One-Time Migration / 初回インストール・一度限りの移行 / 首次安装或一次性迁移',
  '',
  'This build is not signed with an Apple Developer ID or notarized, so macOS may block it during the initial installation. Use the helper below only for the initial installation or when migrating from `v0.27.10` or earlier. Do not use it for normal in-app updates. From `v0.27.11` onward, updates are signature-verified and installed inside the app without downloading another DMG or approving each version in Privacy & Security.',
  '',
  '- **Only if macOS blocks the app:** download `macOS-First-Launch-Helper.zip` from the Assets below, unzip it, and **double-click `Open-No1-Markdown-Editor.command`**. It removes the quarantine attribute from the installed app and opens it.',
  '- **Manual:** in Terminal run:',
  '  ```',
  '  xattr -dr com.apple.quarantine "/Applications/No.1 Markdown Editor.app"',
  '  ```',
  '',
  '**日本語**: このビルドは Apple Developer ID で署名・公証されていないため、macOS が初回インストール時に起動をブロックする場合があります。下記のヘルパーは、初回インストール時、または `v0.27.10` 以前から移行するときに限り使用してください。通常のアプリ内更新では使用しません。`v0.27.11` 以降の更新はアプリ内で署名を検証してインストールされ、新しい DMG のダウンロードや「プライバシーとセキュリティ」でバージョンごとに許可する操作は不要です。macOS にブロックされた場合のみ、Assets から `macOS-First-Launch-Helper.zip` をダウンロードして解凍し、`Open-No1-Markdown-Editor.command` をダブルクリックしてください。',
  '',
  '**中文**: 此版本未使用 Apple Developer ID 签名且未经 Apple 公证，因此 macOS 可能在首次安装时阻止启动。以下助手仅用于首次安装，或从 `v0.27.10` 及更早版本迁移时使用；正常的应用内更新不要运行它。从 `v0.27.11` 开始，后续更新会在应用内验证签名并安装，无需重新下载 DMG，也无需针对每个版本前往“隐私与安全性”重新允许。仅在 macOS 阻止启动时，才从 Assets 下载并解压 `macOS-First-Launch-Helper.zip`，然后双击 `Open-No1-Markdown-Editor.command`。',
].join('\n')

export function extractReleaseNotesDraftBody(source) {
  return extractMarkdownSection(source, 'Suggested GitHub Release Body')
}

export function extractChangelogSection(source, version) {
  const lines = source.split(/\r?\n/u)
  const headerPattern = new RegExp(`^##\\s+${escapeRegExp(version)}(?:\\s+-.*)?$`, 'u')
  const startIndex = lines.findIndex((line) => headerPattern.test(line.trim()))
  if (startIndex === -1) return null

  const bodyLines = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^##\s+/u.test(line)) break
    bodyLines.push(line)
  }

  const section = bodyLines.join('\n').trim()
  return section.length > 0 ? section : null
}

export function assertChangelogSectionExists(source, version) {
  const section = extractChangelogSection(source, version)
  if (section) return section

  throw new Error(`Missing CHANGELOG entry for v${version}. Add a dedicated version section before tagging the release.`)
}

export function buildReleaseBody({
  version,
  changelogSource,
  releaseNotesDraftSource,
  requireChangelogSection = false,
}) {
  const sections = []
  const draftBody = extractReleaseNotesDraftBody(releaseNotesDraftSource)
  const changelogBody = requireChangelogSection
    ? assertChangelogSectionExists(changelogSource, version)
    : extractChangelogSection(changelogSource, version)

  if (draftBody) {
    sections.push(draftBody)
  }

  if (changelogBody) {
    sections.push(['## Changelog Summary', '', changelogBody].join('\n'))
  }

  if (sections.length === 0) {
    throw new Error(`No release body content found for v${version}.`)
  }

  sections.push(MACOS_FIRST_LAUNCH_NOTE)

  return sections.join('\n\n---\n\n').replace(/\bvNext\b/gu, `v${version}`).trim()
}

export async function loadReleaseBody({
  version,
  cwd = process.cwd(),
  requireChangelogSection = false,
}) {
  const [changelogSource, releaseNotesDraftSource] = await Promise.all([
    readFile(path.join(cwd, CHANGELOG_PATH), 'utf8'),
    readFile(path.join(cwd, RELEASE_NOTES_DRAFT_PATH), 'utf8'),
  ])

  return buildReleaseBody({
    version,
    changelogSource,
    releaseNotesDraftSource,
    requireChangelogSection,
  })
}

function extractMarkdownSection(source, heading) {
  const lines = source.split(/\r?\n/u)
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (startIndex === -1) return null

  const sectionLines = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^##\s+/u.test(line)) break
    sectionLines.push(line)
  }

  const section = sectionLines.join('\n').trim()
  return section.length > 0 ? section : null
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isDirectExecution()) {
  const args = process.argv.slice(2)
  const rawVersion = args.find((value) => !value.startsWith('--')) ?? process.env.GITHUB_REF_NAME ?? ''
  const version = rawVersion.replace(/^v/u, '').trim()
  const requireChangelogSection = args.includes('--require-changelog')

  if (!version) {
    console.error('Expected a version argument such as "0.18.0" or GITHUB_REF_NAME like "v0.18.0".')
    process.exitCode = 1
  } else {
    try {
      const body = await loadReleaseBody({ version, requireChangelogSection })
      process.stdout.write(body)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
