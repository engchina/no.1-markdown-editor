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
  '## macOS: First Launch / 初回起動 / 首次启动',
  '',
  'The macOS build is **not notarized by Apple**, so Gatekeeper can block the first installation. This is expected; it is not a real malware detection. Existing users upgrading from a release without the signed in-app updater may need this step one last time. Later updates are verified and installed inside the app.',
  '',
  '- **Easiest (no command):** download `macOS-First-Launch-Helper.zip` from the Assets below, unzip it, and **double-click `Open-No1-Markdown-Editor.command`**. It clears the initial security flag and launches the app.',
  '- **Manual:** in Terminal run:',
  '  ```',
  '  xattr -dr com.apple.quarantine "/Applications/No.1 Markdown Editor.app"',
  '  ```',
  '',
  '**日本語**: この macOS ビルドは Apple の公証を受けていないため、初回インストール時にセキュリティ警告でブロックされることがあります。不具合ではありません。下の Assets から `macOS-First-Launch-Helper.zip` をダウンロードして解凍し、`Open-No1-Markdown-Editor.command` をダブルクリックすると解除して起動できます。署名付きアプリ内アップデーターを搭載していない旧版からの移行時は、この操作が最後に一度だけ必要になる場合があります。以降の更新はアプリ内で検証・インストールされます。',
  '',
  '**中文**: 此 macOS 版本未经 Apple 公证，首次安装时可能被 Gatekeeper 拦截，这是正常现象，不是真的检测到恶意软件。从下方 Assets 下载 `macOS-First-Launch-Helper.zip`，解压后双击 `Open-No1-Markdown-Editor.command` 即可解除并启动。从尚未内置签名更新器的旧版本迁移时，可能还需要最后执行一次；之后的更新会在应用内完成签名验证和安装。',
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
