import assert from 'node:assert/strict'
import test from 'node:test'
import i18n, { LANGUAGES } from '../src/i18n/index.ts'

test('i18n initializes in the Node test runtime without browser storage', () => {
  assert.equal(i18n.language, 'en')
  assert.deepEqual(
    LANGUAGES.map((language) => language.code),
    ['en', 'ja', 'zh']
  )
})
