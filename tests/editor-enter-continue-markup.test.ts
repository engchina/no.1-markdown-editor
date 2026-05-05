import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { insertNewlineContinueMarkup, markdown } from '@codemirror/lang-markdown'
import { insertPlainNewlineForNonSemanticIndent } from '../src/components/Editor/extensions.ts'

function applyContinueMarkup(doc: string, anchor = doc.length): { ok: boolean; doc: string; anchor: number } {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown()],
  })

  let nextState = state
  const view = {
    state,
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      nextState = state.update(spec).state
    },
  }

  const ok = insertNewlineContinueMarkup(view)
  return {
    ok,
    doc: nextState.doc.toString(),
    anchor: nextState.selection.main.head,
  }
}

function applyPlainIndentEnter(doc: string, anchor = doc.length): { ok: boolean; doc: string; anchor: number } {
  const state = EditorState.create({
    doc,
    selection: { anchor },
  })

  let nextState = state
  const view = {
    state,
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      nextState = state.update(spec).state
    },
  }

  const ok = insertPlainNewlineForNonSemanticIndent(view)
  return {
    ok,
    doc: nextState.doc.toString(),
    anchor: nextState.selection.main.head,
  }
}

test('markdown enter continuation keeps list, task list, and blockquote editing predictable', () => {
  assert.deepEqual(applyContinueMarkup('- item'), {
    ok: true,
    doc: '- item\n- ',
    anchor: '- item\n- '.length,
  })

  assert.deepEqual(applyContinueMarkup('- [ ] task'), {
    ok: true,
    doc: '- [ ] task\n- [ ] ',
    anchor: '- [ ] task\n- [ ] '.length,
  })

  assert.deepEqual(applyContinueMarkup('> quote'), {
    ok: true,
    doc: '> quote\n> ',
    anchor: '> quote\n> '.length,
  })

  assert.deepEqual(applyContinueMarkup('1. item'), {
    ok: true,
    doc: '1. item\n2. ',
    anchor: '1. item\n2. '.length,
  })
})

test('markdown enter preserves spaces on indentation-only lines', () => {
  assert.deepEqual(applyPlainIndentEnter(' '), {
    ok: true,
    doc: ' \n',
    anchor: ' \n'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('  ', 1), {
    ok: true,
    doc: ' \n ',
    anchor: ' \n'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('\t'), {
    ok: true,
    doc: '\t\n',
    anchor: '\t\n'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('text '), {
    ok: false,
    doc: 'text ',
    anchor: 'text '.length,
  })
})

test('markdown enter does not continue non-semantic paragraph indentation', () => {
  assert.deepEqual(applyPlainIndentEnter(' aa'), {
    ok: true,
    doc: ' aa\n',
    anchor: ' aa\n'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('  aa'), {
    ok: true,
    doc: '  aa\n',
    anchor: '  aa\n'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('   aa'), {
    ok: true,
    doc: '   aa\n',
    anchor: '   aa\n'.length,
  })
})

test('markdown enter leaves semantic indentation to markdown continuation', () => {
  assert.deepEqual(applyPlainIndentEnter('  - item'), {
    ok: false,
    doc: '  - item',
    anchor: '  - item'.length,
  })

  assert.deepEqual(applyPlainIndentEnter(' > quote'), {
    ok: false,
    doc: ' > quote',
    anchor: ' > quote'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('    code'), {
    ok: false,
    doc: '    code',
    anchor: '    code'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('```\n  code'), {
    ok: false,
    doc: '```\n  code',
    anchor: '```\n  code'.length,
  })

  assert.deepEqual(applyPlainIndentEnter('```\n  '), {
    ok: false,
    doc: '```\n  ',
    anchor: '```\n  '.length,
  })
})

test('markdown enter continuation is still enabled in the editor language setup', async () => {
  const source = await readFile(new URL('../src/components/Editor/optionalFeatures.ts', import.meta.url), 'utf8')

  assert.match(source, /markdown\(\{\s*[\s\S]*addKeymap: true,[\s\S]*\}\)/u)
  assert.match(source, /codeLanguages: resolveMarkdownCodeLanguage/u)
  assert.doesNotMatch(source, /import\('@codemirror\/language-data'\)/u)
})

test('editor core extensions intercept non-semantic indentation before default newline indentation', async () => {
  const source = await readFile(new URL('../src/components/Editor/extensions.ts', import.meta.url), 'utf8')

  assert.match(source, /key:\s*'Enter'/u)
  assert.match(source, /run:\s*insertPlainNewlineForNonSemanticIndent/u)
  assert.match(source, /\.\.\.sourceEditorDefaultKeymap/u)
})
