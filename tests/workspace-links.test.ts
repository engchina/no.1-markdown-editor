import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveWorkspaceDocumentLink } from '../src/lib/workspaceLinks.ts'

const root = 'C:/catalog'
const current = 'C:/catalog/groups/current.md'
const documents = [
  current,
  'C:/catalog/tables/orders.md',
  'C:/catalog/groups/other.md',
  'C:/catalog/guide/index.md',
]

test('workspace links resolve bundle-root, relative, parent, directory index, query, and anchors', () => {
  assert.deepEqual(resolveWorkspaceDocumentLink(root, current, '/tables/orders.md#schema', documents), {
    kind: 'document', path: 'C:/catalog/tables/orders.md', anchor: 'schema', ambiguous: false,
  })
  assert.equal(resolveWorkspaceDocumentLink(root, current, './other.md', documents).path, 'C:/catalog/groups/other.md')
  assert.equal(resolveWorkspaceDocumentLink(root, current, '../tables/orders.md', documents).path, 'C:/catalog/tables/orders.md')
  assert.equal(resolveWorkspaceDocumentLink(root, current, '/guide/', documents).path, 'C:/catalog/guide/index.md')
  assert.deepEqual(resolveWorkspaceDocumentLink(root, current, '/guide?view=full#intro', documents), {
    kind: 'document', path: 'C:/catalog/guide/index.md', anchor: 'intro', ambiguous: false,
  })
})

test('workspace links distinguish same-document anchors, external links, broken paths, and escapes', () => {
  assert.deepEqual(resolveWorkspaceDocumentLink(root, current, '#section', documents), {
    kind: 'anchor', path: current, anchor: 'section', ambiguous: false,
  })
  assert.equal(resolveWorkspaceDocumentLink(root, current, 'https://example.com', documents).kind, 'external')
  assert.equal(resolveWorkspaceDocumentLink(root, current, './missing.md', documents).kind, 'broken')
  assert.equal(resolveWorkspaceDocumentLink(root, current, '../../outside.md', documents).kind, 'outside-workspace')
})
