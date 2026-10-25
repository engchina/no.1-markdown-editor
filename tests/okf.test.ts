import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOkfBundleProfile } from '../src/lib/okf.ts'
import { buildWorkspaceIndexDocument } from '../src/lib/workspaceIndex/analysis.ts'
import type { WorkspaceIndexSnapshot } from '../src/lib/workspaceIndex/types.ts'

const ROOT = 'C:/catalog'

function snapshot(files: Record<string, string>): WorkspaceIndexSnapshot {
  const documents = Object.entries(files).map(([relativePath, content]) =>
    buildWorkspaceIndexDocument(`${ROOT}/${relativePath}`, content, ROOT)
  )
  return {
    rootPath: ROOT,
    generatedAt: 1,
    documents,
    files: documents.map((document) => ({ path: document.path, name: document.name })),
  }
}

const VALID_CONCEPT = `---
type: BigQuery Table
title: Customer Orders
description: One row per completed customer order across all channels.
resource: https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders
tags: [sales, orders, revenue]
timestamp: 2026-05-28T14:30:00Z
unknown_field:
  preserved: true
---

# Schema
`

test('OKF auto mode activates from root version declaration and accepts the complete example', () => {
  const profile = buildOkfBundleProfile(snapshot({
    'index.md': '---\nokf_version: "0.1"\n---\n\n## Tables\n\n- [Orders](/tables/orders.md)\n',
    'tables/orders.md': VALID_CONCEPT,
  }), 'auto')
  assert.equal(profile.enabled, true)
  assert.equal(profile.source, 'declaration')
  assert.equal(profile.version, '0.1')
  assert.deepEqual(profile.issues, [])
})

test('OKF auto mode leaves ordinary Markdown workspaces unchanged', () => {
  const profile = buildOkfBundleProfile(snapshot({ 'notes/readme.md': '# Ordinary note\n' }), 'auto')
  assert.equal(profile.enabled, false)
  assert.deepEqual(profile.issues, [])
})

test('manual OKF mode treats only front matter and type as concept conformance requirements', () => {
  const profile = buildOkfBundleProfile(snapshot({
    'concept.md': '---\ntype: Custom Unknown Type\nextra: kept\n---\n\nBody',
  }), 'enabled')
  assert.equal(profile.errorCount, 0)
  assert.deepEqual(
    profile.issues.map((entry) => entry.code).sort(),
    ['description-recommended', 'timestamp-recommended', 'title-recommended']
  )
})

test('OKF accepts parseable ISO 8601 datetimes with or without an explicit timezone', () => {
  const profile = buildOkfBundleProfile(snapshot({
    'utc.md': '---\ntype: Example\ntimestamp: 2026-05-28T14:30:00Z\n---\n',
    'local.md': '---\ntype: Example\ntimestamp: 2026-05-28T14:30:00\n---\n',
  }), 'enabled')
  assert.ok(!profile.issues.some((entry) => entry.code === 'timestamp-format'))
})

test('OKF concept validation reports missing type and invalid provided fields', () => {
  const profile = buildOkfBundleProfile(snapshot({
    'missing.md': '# Missing metadata',
    'invalid.md': `---
type: ''
description:
  - not
  - text
resource: relative/path
tags: [ok, 2]
timestamp: 2026-05-28
---
`,
    'dots.md': '---\ntype: Example\n...\n',
  }), 'enabled')
  const codes = profile.issues.filter((entry) => entry.severity === 'error').map((entry) => entry.code)
  assert.ok(codes.includes('frontmatter-absent'))
  assert.ok(codes.includes('type-required'))
  assert.ok(codes.includes('description-format'))
  assert.ok(codes.includes('resource-format'))
  assert.ok(codes.includes('tags-format'))
  assert.ok(codes.includes('timestamp-format'))
  assert.ok(codes.includes('frontmatter-closing-marker'))
})

test('OKF reserved documents validate root scope, groups, list links, and log order', () => {
  const profile = buildOkfBundleProfile(snapshot({
    'index.md': '---\nokf_version: "0.2"\n---\n\n### Wrong group\n\n[Not a list](./concept.md)\n',
    'nested/index.md': '---\ntitle: Nested\n---\n\n## Group\n\n- [Concept](../concept.md)\n',
    'log.md': '## 2026-05-01\n\n## invalid\n\n## 2026-06-01\n',
    'concept.md': '---\ntype: Example\n---\n',
  }), 'auto')
  const codes = profile.issues.map((entry) => entry.code)
  assert.ok(codes.includes('unsupported-version'))
  assert.ok(codes.includes('nested-index-frontmatter'))
  assert.ok(codes.includes('index-heading-level'))
  assert.ok(codes.includes('index-link-list'))
  assert.ok(codes.includes('log-date-heading'))
  assert.ok(codes.includes('log-date-order'))
})

test('OKF does not make missing index, unknown fields, or broken links conformance errors', () => {
  const profile = buildOkfBundleProfile(snapshot({
    'concept.md': `${VALID_CONCEPT}\n[Missing](./missing.md)\n`,
  }), 'enabled')
  assert.equal(profile.errorCount, 0)
})
