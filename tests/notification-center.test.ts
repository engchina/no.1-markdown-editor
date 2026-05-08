import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('notification close control has a stable clickable icon target', async () => {
  const source = await readFile(
    new URL('../src/components/Notifications/NotificationCenter.tsx', import.meta.url),
    'utf8'
  )

  assert.match(source, /className="pointer-events-none fixed bottom-5 right-5 z-\[120\]/)
  assert.match(source, /className="pointer-events-auto animate-in rounded-2xl border p-4 shadow-xl glass-panel"/)
  assert.match(source, /className="pointer-events-auto flex h-8 w-8 flex-shrink-0 cursor-pointer/)
  assert.match(source, /<AppIcon name="x" size=\{16\} \/>/)
  assert.match(source, /aria-label=\{t\('notices\.dismissLabel'\)\}/)
})
