import assert from 'node:assert/strict'
import test from 'node:test'
import { findWorkspaceDocumentReferences } from '../src/lib/workspaceSearch.ts'

test('findWorkspaceDocumentReferences returns matching open-tab notes ordered by name/path relevance', async () => {
  const references = await findWorkspaceDocumentReferences({
    query: 'project plan',
    tabs: [
      {
        id: 'tab-1',
        name: 'current.md',
        path: 'notes/current.md',
        content: '# Current',
      },
      {
        id: 'tab-2',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan\n\nDetails.',
      },
      {
        id: 'tab-3',
        name: 'project-retrospective.md',
        path: 'notes/project-retrospective.md',
        content: '# Retro',
      },
    ],
    rootPath: null,
    limit: 5,
  })

  assert.deepEqual(
    references.map((reference) => reference.name),
    ['project-plan.md']
  )
  assert.equal(references[0]?.content, '# Plan\n\nDetails.')
  assert.equal(references[0]?.confidence, 'high')
  assert.equal(references[0]?.ambiguous, false)
})

test('findWorkspaceDocumentReferences respects excluded note paths when building attachable results', async () => {
  const references = await findWorkspaceDocumentReferences({
    query: 'project',
    tabs: [
      {
        id: 'tab-1',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan',
      },
      {
        id: 'tab-2',
        name: 'project-retrospective.md',
        path: 'notes/project-retrospective.md',
        content: '# Retro',
      },
    ],
    rootPath: null,
    limit: 5,
    excludePaths: ['notes/project-plan.md'],
  })

  assert.deepEqual(
    references.map((reference) => reference.name),
    ['project-retrospective.md']
  )
})

test('findWorkspaceDocumentReferences marks ambiguous broad matches with degraded confidence', async () => {
  const references = await findWorkspaceDocumentReferences({
    query: 'project',
    tabs: [
      {
        id: 'tab-1',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan',
      },
      {
        id: 'tab-2',
        name: 'project-retrospective.md',
        path: 'notes/project-retrospective.md',
        content: '# Retro',
      },
    ],
    rootPath: null,
    limit: 2,
  })

  assert.equal(references.length, 2)
  assert.equal(references[0]?.ambiguous, true)
  assert.equal(references[0]?.confidence, 'low')
  assert.equal(references[1]?.ambiguous, true)
})
