import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { MARKDOWN_FILE_EXTENSIONS } from '../src/lib/fileTypes.ts'

async function readTauriConfig() {
  const source = await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')
  return JSON.parse(source)
}

test('Windows installer shortcuts and file associations use the product icon explicitly', async () => {
  const [config, wixTemplate] = await Promise.all([
    readTauriConfig(),
    readFile(new URL('../src-tauri/wix/main.wxs', import.meta.url), 'utf8'),
  ])

  assert.equal(config.bundle.windows.wix.template, 'wix/main.wxs')
  assert.equal(config.bundle.windows.wix.upgradeCode, '2A43089D-D7E9-533A-B6A3-43EAEF3F3D3F')
  assert.equal(config.bundle.windows.nsis.installerIcon, 'icons/icon.ico')

  const desktopShortcut = wixTemplate.slice(
    wixTemplate.indexOf('<Shortcut Id="ApplicationDesktopShortcut"'),
    wixTemplate.indexOf('</Shortcut>', wixTemplate.indexOf('<Shortcut Id="ApplicationDesktopShortcut"'))
  )

  assert.match(desktopShortcut, /Icon="ProductIcon"/u)
  assert.ok(
    desktopShortcut.includes('<ShortcutProperty Key="System.AppUserModel.ID" Value="{{bundle_id}}"/>')
  )
  assert.ok(
    wixTemplate.includes(
      '<ProgId Id="{{../../product_name}}.{{ext}}" Advertise="yes" Description="{{association.description}}" Icon="ProductIcon" IconIndex="0">'
    )
  )
})

test('desktop file associations cover every document extension the app can open', async () => {
  const config = await readTauriConfig()
  const associations = config.bundle.fileAssociations
  const associatedExtensions = associations.flatMap((association: { ext: string[] }) => association.ext)

  assert.deepEqual(
    [...associatedExtensions].sort(),
    [...MARKDOWN_FILE_EXTENSIONS].sort()
  )

  const markdownAssociation = associations.find((association: { ext: string[] }) => association.ext.includes('md'))
  assert.equal(markdownAssociation?.mimeType, 'text/markdown')

  const textAssociation = associations.find((association: { ext: string[] }) => association.ext.includes('txt'))
  assert.equal(textAssociation?.mimeType, 'text/plain')
  assert.equal(textAssociation?.rank, 'Alternate')
})
