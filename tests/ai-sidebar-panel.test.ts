import assert from 'node:assert/strict'
import test from 'node:test'
import { access, readFile } from 'node:fs/promises'

test('editor store and app remove AI from the sidebar surface', async () => {
  const [store, sidebar, app] = await Promise.all([
    readFile(new URL('../src/store/editor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(store, /export type SidebarTab = 'outline' \| 'files' \| 'recent' \| 'search'/)
  assert.match(store, /function sanitizeSidebarTab\(value: unknown\): SidebarTab/)
  assert.match(store, /case 'ai':/)
  assert.match(store, /sidebarTab: sanitizeSidebarTab\(persistedState\?\.sidebarTab\)/)
  assert.match(sidebar, /data-sidebar-tab=\{id\}/)
  assert.match(sidebar, /\{ id: 'outline', icon: 'outline', title: t\('sidebar\.outline'\) \}/)
  assert.match(sidebar, /\{ id: 'files', icon: 'folder', title: t\('sidebar\.files'\) \}/)
  assert.match(sidebar, /\{ id: 'recent', icon: 'clock', title: t\('menu\.recentFiles'\) \}/)
  assert.match(sidebar, /\{ id: 'search', icon: 'search', title: t\('sidebar\.search'\) \}/)
  assert.doesNotMatch(sidebar, /AISidebarPanel/)
  assert.match(app, /<Sidebar width=\{resolvedSidebarWidth\} \/>/)
  assert.doesNotMatch(app, /AISidebarPeekRail/)
  assert.doesNotMatch(app, /aiPeekView/)
})

test('sidebar-specific AI components and locale keys are removed', async () => {
  const [enRaw, jaRaw, zhRaw, aiTypes] = await Promise.all([
    readFile(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/ja.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n/locales/zh.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai/types.ts', import.meta.url), 'utf8'),
  ])

  await Promise.all([
    assert.rejects(access(new URL('../src/components/Sidebar/AISidebarPanel.tsx', import.meta.url))),
    assert.rejects(access(new URL('../src/components/Sidebar/AISidebarPeekRail.tsx', import.meta.url))),
    assert.rejects(access(new URL('../src/components/Sidebar/aiSidebarShared.ts', import.meta.url))),
  ])

  const en = JSON.parse(enRaw) as Record<string, unknown>
  const ja = JSON.parse(jaRaw) as Record<string, unknown>
  const zh = JSON.parse(zhRaw) as Record<string, unknown>

  for (const locale of [en, ja, zh]) {
    assert.equal((locale.sidebar as Record<string, unknown>).ai, undefined)
    assert.equal((locale.ai as Record<string, unknown>).sidebar, undefined)
    assert.equal(((locale.ai as Record<string, unknown>).source as Record<string, unknown>)['sidebar-tab'], undefined)
  }

  assert.doesNotMatch(aiTypes, /sidebar-tab/)
})
