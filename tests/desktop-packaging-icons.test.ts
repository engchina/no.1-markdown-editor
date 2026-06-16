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
  assert.equal(config.bundle.windows.nsis.installerHooks, 'nsis/association-hooks.nsh')

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
  assert.ok(wixTemplate.includes('Software\\Classes\\Applications\\no1-markdown-editor.exe'))
  assert.ok(wixTemplate.includes('<RegistryValue Type="string" Name="FriendlyAppName" Value="{{product_name}}" />'))
  assert.ok(wixTemplate.includes('<RegistryValue Type="string" Value="&quot;[!Path]&quot; &quot;%1&quot;" />'))
  assert.ok(wixTemplate.includes('<RegistryValue Type="string" Name=".{{ext}}" Value="" />'))
})

test('NSIS installer registers the executable Applications ProgId and refreshes shell associations', async () => {
  const [config, hooks] = await Promise.all([
    readTauriConfig(),
    readFile(new URL('../src-tauri/nsis/association-hooks.nsh', import.meta.url), 'utf8'),
  ])

  assert.equal(config.bundle.windows.nsis.installerHooks, 'nsis/association-hooks.nsh')
  assert.match(hooks, /Software\\Classes\\Applications\\\$\{MAINBINARYNAME\}\.exe/u)
  assert.match(hooks, /shell\\open\\command/u)
  assert.match(hooks, /\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe\$\\" \$\\"%1\$\\"/u)
  assert.match(hooks, /SupportedTypes" "\.md" ""/u)
  assert.match(hooks, /SupportedTypes" "\.markdown" ""/u)
  assert.match(hooks, /SupportedTypes" "\.mdx" ""/u)
  assert.match(hooks, /SupportedTypes" "\.txt" ""/u)
  assert.match(hooks, /!macro NSIS_HOOK_POSTINSTALL/u)
  assert.match(hooks, /!macro NSIS_HOOK_POSTUNINSTALL/u)
  assert.equal((hooks.match(/!insertmacro UPDATEFILEASSOC/gu) ?? []).length, 2)
})

test('Windows file association diagnostics check UserChoice and Applications open commands', async () => {
  const source = await readFile(
    new URL('../scripts/diagnose-windows-file-associations.ps1', import.meta.url),
    'utf8'
  )

  assert.match(source, /FileExts\\\$Extension\\UserChoice/u)
  assert.match(source, /Applications\\\$BinaryName/u)
  assert.match(source, /\\shell\\open\\command/u)
  assert.match(source, /HasPathArgument/u)
  assert.match(source, /ExecutableExists/u)
  assert.match(source, /UserChoice points to Applications\\\$BinaryName/u)
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

test('desktop asset protocol is enabled for local media preview playback', async () => {
  const config = await readTauriConfig()
  const assetProtocol = config.app.security.assetProtocol

  assert.equal(assetProtocol.enable, true)
  assert.ok(assetProtocol.scope.allow.includes('$VIDEO/**'))
  assert.ok(assetProtocol.scope.allow.includes('$AUDIO/**'))
  assert.ok(assetProtocol.scope.allow.includes('**/*.[mM][pP][4]'))
  assert.ok(assetProtocol.scope.allow.includes('**/*.[wW][eE][bB][mM]'))
  assert.ok(assetProtocol.scope.allow.includes('**/*.[mM][pP][3]'))
  assert.ok(assetProtocol.scope.allow.includes('**/*.[vV][tT][tT]'))
  assert.ok(assetProtocol.scope.allow.includes('**/*.[pP][nN][gG]'))
  assert.ok(!assetProtocol.scope.allow.includes('$HOME/**'))
  assert.ok(assetProtocol.scope.deny.includes('**/.ssh/**'))
  assert.ok(assetProtocol.scope.deny.includes('$HOME/.ssh/**'))
})
