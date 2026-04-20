import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildHostedAgentInvokeUrlPreview,
  buildHostedAgentTokenUrlPreview,
  normalizeAIProviderConfig,
} from '../src/lib/ai/provider.ts'
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

test('normalizeAIProviderConfig normalizes hosted agent profile defaults', () => {
  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: 'https://example.com/v1',
    model: 'model-x',
    project: '',
    unstructuredStores: [],
    structuredStores: [],
    hostedAgentProfiles: [
      {
        id: 'hosted-agent-1',
        label: 'Travel Agent',
        ociRegion: ' us-chicago-1 ',
        hostedApplicationOcid: ' ocid1.generativeaihostedapplication.oc1..demo ',
        apiVersion: ' ',
        apiAction: ' /chat/ ',
        domainUrl: 'https://idcs.example.com',
        clientId: ' client-id ',
        scope: ' https://k8scloud.site/invoke ',
        transport: 'http-json',
        supportedContracts: ['chat-text'],
      },
    ],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.deepEqual(config.hostedAgentProfiles, [
    {
      id: 'hosted-agent-1',
      label: 'Travel Agent',
      ociRegion: 'us-chicago-1',
      hostedApplicationOcid: 'ocid1.generativeaihostedapplication.oc1..demo',
      apiVersion: '20251112',
      apiAction: 'chat',
      domainUrl: 'https://idcs.example.com',
      clientId: 'client-id',
      scope: 'https://k8scloud.site/invoke',
      transport: 'http-json',
      supportedContracts: ['chat-text'],
    },
  ])
})

test('normalizeAIProviderConfig defaults apiAction to chat when blank', () => {
  const config = normalizeAIProviderConfig({
    provider: 'oci-responses',
    baseUrl: 'https://example.com/v1',
    model: 'model-x',
    project: '',
    unstructuredStores: [],
    structuredStores: [],
    hostedAgentProfiles: [
      {
        id: 'hosted-agent-1',
        label: 'Travel Agent',
        ociRegion: 'us-chicago-1',
        hostedApplicationOcid: 'ocid1.generativeaihostedapplication.oc1..demo',
        apiVersion: '20251112',
        apiAction: '',
        domainUrl: 'https://idcs.example.com',
        clientId: 'client-id',
        scope: 'scope',
        transport: 'http-json',
        supportedContracts: ['chat-text'],
      },
    ],
  })

  assert.equal(config.provider, 'oci-responses')
  assert.equal(
    config.provider === 'oci-responses' ? config.hostedAgentProfiles[0]?.apiAction : null,
    'chat'
  )
})

test('normalizeAIProviderConfig rejects hosted agent profiles missing OCI identifiers', () => {
  assert.throws(
    () =>
      normalizeAIProviderConfig({
        provider: 'oci-responses',
        baseUrl: 'https://example.com/v1',
        model: 'model-x',
        project: '',
        unstructuredStores: [],
        structuredStores: [],
        hostedAgentProfiles: [
          {
            id: 'hosted-agent-1',
            label: 'Travel Agent',
            ociRegion: '',
            hostedApplicationOcid: '',
            apiVersion: '',
            apiAction: 'chat',
            domainUrl: 'https://idcs.example.com',
            clientId: 'client-id',
            scope: 'https://k8scloud.site/invoke',
            transport: 'http-json',
            supportedContracts: ['chat-text'],
          },
        ],
      }),
    /Hosted agent OCI region is required/u
  )
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

test('buildHostedAgentTokenUrlPreview normalizes the token endpoint URL', () => {
  assert.equal(
    buildHostedAgentTokenUrlPreview(' https://idcs.example.com/ '),
    'https://idcs.example.com/oauth2/v1/token'
  )
  assert.equal(buildHostedAgentTokenUrlPreview(''), '')
})

test('buildHostedAgentInvokeUrlPreview composes the hosted invoke URL from profile fields', () => {
  assert.equal(
    buildHostedAgentInvokeUrlPreview({
      ociRegion: ' us-chicago-1 ',
      hostedApplicationOcid: ' ocid1.generativeaihostedapplication.oc1..demo ',
      apiVersion: ' ',
      apiAction: ' /chat/ ',
    }),
    'https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1..demo/actions/invoke/chat'
  )
  assert.equal(
    buildHostedAgentInvokeUrlPreview({
      ociRegion: '',
      hostedApplicationOcid: 'ocid1.generativeaihostedapplication.oc1..demo',
      apiVersion: '20251112',
      apiAction: 'chat',
    }),
    ''
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
