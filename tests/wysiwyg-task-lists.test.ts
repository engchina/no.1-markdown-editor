import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('wysiwyg task list live preview wires custom bullets, checkbox widgets, and editable active-line fallbacks', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /class CheckboxWidget extends WidgetType/u)
  assert.ok(source.includes("el.className = `cm-wysiwyg-checkbox ${this.checked ? 'is-checked' : ''}`"))
  assert.ok(source.includes("el.setAttribute('role', 'checkbox')"))
  assert.ok(source.includes("el.setAttribute('aria-checked', String(this.checked))"))
  assert.ok(source.includes("el.setAttribute('aria-keyshortcuts', 'Enter Space')"))
  assert.ok(source.includes('el.tabIndex = 0'))
  assert.match(source, /class ListBulletWidget extends WidgetType/u)
  assert.ok(source.includes("if (this.depth === 0) el.textContent = '•'"))
  assert.ok(source.includes("else if (this.depth === 1) el.textContent = '◦'"))
  assert.ok(source.includes("else el.textContent = '▪'"))

  assert.ok(source.includes("const listMatch = text.match(/^(\\s*)([-*+]|\\d+[.)])(\\s+)/)"))
  assert.ok(source.includes("const taskMatch = text.match(/^(\\s*)([-*+]\\s+\\[(?: |x|X)\\])(\\s*)/)"))
  assert.ok(source.includes("Decoration.mark({ class: 'cm-wysiwyg-ordered-number' })"))
  assert.ok(source.includes("Decoration.replace({ widget: new ListBulletWidget(depth) })"))
  assert.ok(source.includes("Decoration.replace({ widget: new CheckboxWidget(isChecked, mStart, label) })"))
  assert.ok(source.includes("Decoration.mark({ class: 'cm-wysiwyg-task-marker' })"))
  assert.ok(source.includes("Decoration.mark({ class: 'cm-wysiwyg-task-completed' })"))
  assert.ok(source.includes("checkbox.classList.toggle('is-checked')"))
  assert.match(
    source,
    /closest\('\.cm-wysiwyg-checkbox'\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?return true/u,
  )
  assert.match(source, /'\.cm-wysiwyg-checkbox:focus-visible': \{[\s\S]*?outline:[\s\S]*?boxShadow:/u)

  assert.ok(source.includes("'.cm-wysiwyg-task-completed': {"))
  assert.ok(source.includes("'.cm-wysiwyg-task-marker': {"))
  assert.ok(source.includes("'.cm-wysiwyg-bullet-simple': {"))
  assert.ok(source.includes("'.cm-wysiwyg-ordered-number': {"))
  assert.ok(source.includes("'.cm-wysiwyg-checkbox.is-checked .checkmark': {"))
})

test('preview task list styles target semantic GFM task list markup and custom checkbox chrome', async () => {
  const css = await readFile(new URL('../src/global.css', import.meta.url), 'utf8')

  assert.match(css, /\.markdown-preview ul\.contains-task-list,\s*\.markdown-preview ul\.contains-task-list ul\.contains-task-list\s*\{/u)
  assert.match(css, /\.markdown-preview li\.task-list-item\s*\{/u)
  assert.match(css, /\.markdown-preview li\.task-list-item > input\[type="checkbox"\]\s*\{/u)
  assert.match(css, /\.markdown-preview input\[type="checkbox"\]\s*\{[\s\S]*appearance:\s*none;/u)
  assert.match(css, /\.markdown-preview input\[type="checkbox"\]:checked\s*\{/u)
  assert.match(css, /\.markdown-preview input\[type="checkbox"\]::after\s*\{/u)
  assert.match(css, /\.markdown-preview input\[type="checkbox"\]:checked::after\s*\{/u)
})
