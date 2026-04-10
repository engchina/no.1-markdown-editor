import assert from 'node:assert/strict'
import test from 'node:test'
import { getAIDocumentLanguageLabelKey } from '../src/lib/ai/documentLanguageLabels.ts'

test('getAIDocumentLanguageLabelKey normalizes supported AI document language codes', () => {
  assert.equal(getAIDocumentLanguageLabelKey('en'), 'ai.documentLanguageValue.en')
  assert.equal(getAIDocumentLanguageLabelKey('JA'), 'ai.documentLanguageValue.ja')
  assert.equal(getAIDocumentLanguageLabelKey(' zh '), 'ai.documentLanguageValue.zh')
  assert.equal(getAIDocumentLanguageLabelKey('mixed'), 'ai.documentLanguageValue.mixed')
})

test('getAIDocumentLanguageLabelKey returns null for unsupported values', () => {
  assert.equal(getAIDocumentLanguageLabelKey('de'), null)
  assert.equal(getAIDocumentLanguageLabelKey(undefined), null)
})
