import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { canonicalFsPathKey, resolveExternalFileContentChange } from '../src/lib/externalFileChanges.ts'

test('resolveExternalFileContentChange ignores local unsaved edits when disk still matches the last save', () => {
  assert.equal(
    resolveExternalFileContentChange(
      {
        content: '![image](./images/image.png)\n',
        savedContent: '![image](./images/image.png)',
        isDirty: true,
      },
      '![image](./images/image.png)'
    ),
    'noop'
  )
})

test('resolveExternalFileContentChange ignores transient save races when disk already matches the in-memory tab', () => {
  assert.equal(
    resolveExternalFileContentChange(
      {
        content: '# Draft\n\nUpdated',
        savedContent: '# Draft',
        isDirty: true,
      },
      '# Draft\n\nUpdated'
    ),
    'noop'
  )
})

test('resolveExternalFileContentChange flags true external conflicts only when disk diverges from both local and saved content', () => {
  assert.equal(
    resolveExternalFileContentChange(
      {
        content: '# Local edit',
        savedContent: '# Last saved',
        isDirty: true,
      },
      '# External edit'
    ),
    'conflict'
  )
})

test('resolveExternalFileContentChange reloads clean tabs when disk changed externally', () => {
  assert.equal(
    resolveExternalFileContentChange(
      {
        content: '# Last saved',
        savedContent: '# Last saved',
        isDirty: false,
      },
      '# Disk changed'
    ),
    'reload'
  )
})

test('resolveExternalFileContentChange treats a CRLF disk file as unchanged against its LF in-memory twin', () => {
  // CodeMirror normalizes content to LF in memory; the file on disk keeps CRLF.
  // Without EOL-insensitive comparison this would loop as a phantom reload.
  assert.equal(
    resolveExternalFileContentChange(
      {
        content: '# Title\n\nBody line',
        savedContent: '# Title\n\nBody line',
        isDirty: false,
      },
      '# Title\r\n\r\nBody line'
    ),
    'noop'
  )
})

test('resolveExternalFileContentChange ignores unsaved edits when CRLF disk still matches the last save', () => {
  assert.equal(
    resolveExternalFileContentChange(
      {
        content: '# Title\n\nNew edit',
        savedContent: '# Title\n\nBody',
        isDirty: true,
      },
      '# Title\r\n\r\nBody'
    ),
    'noop'
  )
})

test('resolveExternalFileContentChange still detects real content changes on CRLF files', () => {
  assert.equal(
    resolveExternalFileContentChange(
      {
        content: '# Title\n\nBody',
        savedContent: '# Title\n\nBody',
        isDirty: false,
      },
      '# Title\r\n\r\nBody changed externally'
    ),
    'reload'
  )
})

test('canonicalFsPathKey matches Windows verbatim, separator, and casing aliases of the same file', () => {
  assert.equal(
    canonicalFsPathKey('\\\\?\\C:\\Docs\\Note.md'),
    canonicalFsPathKey('c:/docs/note.md')
  )
  assert.equal(
    canonicalFsPathKey('C:\\Docs\\Note.md'),
    canonicalFsPathKey('C:/Docs/Note.md')
  )
  assert.equal(
    canonicalFsPathKey('\\\\?\\UNC\\server\\share\\Note.md'),
    canonicalFsPathKey('\\\\server\\share\\note.md')
  )
})

test('canonicalFsPathKey keeps POSIX paths case-sensitive', () => {
  assert.notEqual(canonicalFsPathKey('/home/user/Note.md'), canonicalFsPathKey('/home/user/note.md'))
  assert.equal(canonicalFsPathKey('/home/user/Note.md'), canonicalFsPathKey('/home/user/Note.md'))
})

test('ExternalFileConflictDialog keeps memo hooks above the early return guard', async () => {
  const source = await readFile(new URL('../src/components/ExternalFileConflicts/ExternalFileConflictDialog.tsx', import.meta.url), 'utf8')

  const blocksIndex = source.indexOf('const blocks = useMemo')
  const returnIndex = source.indexOf('if (missingFiles.length > 0 || !conflict || !tab) return null')

  assert.notEqual(blocksIndex, -1)
  assert.notEqual(returnIndex, -1)
  assert.ok(blocksIndex < returnIndex, 'memo hooks must stay above the early return guard')
})
