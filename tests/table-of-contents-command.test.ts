import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('table of contents commands are registered in the editor command pipeline', async () => {
  const [formatCommands, commands, palette] = await Promise.all([
    readFile(new URL('../src/components/Editor/formatCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useCommands.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CommandPalette/CommandPalette.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(formatCommands, /case 'tocH2':\s+return insertTableOfContents\(view, 2\)/u)
  assert.match(formatCommands, /case 'tocH3':\s+return insertTableOfContents\(view, 3\)/u)
  assert.match(commands, /id: 'edit\.tocH2'[\s\S]*emitFormat\('tocH2'\)/u)
  assert.match(commands, /id: 'edit\.tocH3'[\s\S]*emitFormat\('tocH3'\)/u)
  assert.match(palette, /\['edit\.tocH2', 126\]/u)
  assert.match(palette, /\['edit\.tocH3', 127\]/u)
})

test('table of contents command copy exists in all locales', async () => {
  const locales = ['en', 'ja', 'zh']

  for (const locale of locales) {
    const messages = JSON.parse(
      await readFile(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
    )

    assert.equal(typeof messages.commands.insertTableOfContentsH2, 'string', `${locale}: H2 command missing`)
    assert.equal(typeof messages.commands.insertTableOfContentsH2Description, 'string', `${locale}: H2 description missing`)
    assert.equal(typeof messages.commands.insertTableOfContentsH3, 'string', `${locale}: H3 command missing`)
    assert.equal(typeof messages.commands.insertTableOfContentsH3Description, 'string', `${locale}: H3 description missing`)
    assert.equal(typeof messages.notices.insertTableOfContentsNoneTitle, 'string', `${locale}: empty notice title missing`)
    assert.equal(typeof messages.notices.insertTableOfContentsNoneMessage, 'string', `${locale}: empty notice message missing`)
  }
})
