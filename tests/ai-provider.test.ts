import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAIProviderConfig } from '../src/lib/ai/provider.ts'
import { getAIDocumentThreadKey, parseAIDocumentThreadKey } from '../src/lib/ai/thread.ts'

test('normalizeAIProviderConfig trims and validates openai-compatible settings', () => {
  const config = normalizeAIProviderConfig({
    provider: 'openai-compatible',
    baseUrl: ' https://example.com/v1/ ',
    model: ' gpt-test ',
    project: '  project-123  ',
  })

  assert.deepEqual(config, {
    provider: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    model: 'gpt-test',
    project: 'project-123',
  })
})

test('normalizeAIProviderConfig accepts oci-responses with empty project', () => {
  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: 'https://example.com/v1',
    model: 'model-x',
    project: '',
    unstructuredStores: [],
    structuredStores: [],
    hostedAgentProfiles: [],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.equal(config.project, '')
})

test('normalizeAIProviderConfig rejects invalid base URLs', () => {
  assert.throws(
    () =>
      normalizeAIProviderConfig({
        provider: 'openai-compatible',
        baseUrl: 'ftp://example.com',
        model: 'model',
        project: '',
      }),
    /HTTP or HTTPS/u
  )
})

test('getAIDocumentThreadKey uses path for saved files and tab id for drafts', () => {
  assert.equal(getAIDocumentThreadKey('tab-1', 'notes\\demo.md'), 'path:notes/demo.md')
  assert.equal(getAIDocumentThreadKey('draft-1', null), 'draft:draft-1')
})

test('parseAIDocumentThreadKey understands saved-path and draft thread keys', () => {
  assert.deepEqual(parseAIDocumentThreadKey('path:notes/demo.md'), { kind: 'path', value: 'notes/demo.md' })
  assert.deepEqual(parseAIDocumentThreadKey('draft:draft-1'), { kind: 'draft', value: 'draft-1' })
  assert.equal(parseAIDocumentThreadKey('invalid-key'), null)
})
