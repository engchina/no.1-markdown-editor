import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('document tabs stay horizontal-only so the tab strip cannot render a vertical scrollbar', async () => {
  const tabs = await readFile(new URL('../src/components/DocumentTabs/DocumentTabs.tsx', import.meta.url), 'utf8')

  assert.match(tabs, /className="flex min-w-0 flex-shrink-0 items-end overflow-x-auto overflow-y-hidden px-3"/)
})

test('document tabs contains side-by-side capsule buttons for filePlus and globe, without dropdown lists or portals', async () => {
  const tabs = await readFile(new URL('../src/components/DocumentTabs/DocumentTabs.tsx', import.meta.url), 'utf8')

  // Asserts the capsule buttons exist
  assert.match(tabs, /name="filePlus"/)
  assert.match(tabs, /name="globe"/)

  // Asserts the old popover logic is completely removed
  assert.doesNotMatch(tabs, /createPortal\(/)
  assert.doesNotMatch(tabs, /showMenu/)
  assert.doesNotMatch(tabs, /useAnchoredOverlayStyle/)
})
