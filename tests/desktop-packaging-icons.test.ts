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
  assert.ok(wixTemplate.includes('Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\no1-markdown-editor.exe'))
  assert.ok(wixTemplate.includes('Software\\RegisteredApplications'))
  assert.ok(wixTemplate.includes('Software\\No1MarkdownEditor\\Capabilities'))
  assert.ok(wixTemplate.includes('Name="{{product_name}}" Value="Software\\No1MarkdownEditor\\Capabilities"'))
  assert.ok(wixTemplate.includes('Name=".{{ext}}" Value="No1MarkdownEditor.{{ext}}"'))
  assert.ok(wixTemplate.includes('Software\\Classes\\.{{ext}}"'))
  assert.ok(wixTemplate.includes('<RegistryValue Type="string" Value="No1MarkdownEditor.{{ext}}" />'))
  assert.ok(wixTemplate.includes('Name="Content Type" Value="{{association.mimeType}}"'))
  assert.ok(wixTemplate.includes('Software\\Classes\\No1MarkdownEditor.{{ext}}"'))
  assert.ok(wixTemplate.includes('Software\\Classes\\{{../../product_name}}.{{ext}}"'))
})

test('NSIS installer registers default document ProgIds and refreshes shell associations', async () => {
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
  assert.match(hooks, /!define NO1_PROGID_PREFIX "No1MarkdownEditor"/u)
  assert.match(hooks, /Software\\Classes\\\.\$\{EXT\}" "" "\$\{NO1_PROGID_PREFIX\}\.\$\{EXT\}"/u)
  assert.match(hooks, /Software\\Classes\\\$\{NO1_PROGID_PREFIX\}\.\$\{EXT\}\\shell\\open\\command/u)
  assert.match(hooks, /Software\\Classes\\\$\{PRODUCTNAME\}\.\$\{EXT\}\\shell\\open\\command/u)
  assert.match(hooks, /Software\\RegisteredApplications" "\$\{PRODUCTNAME\}" "Software\\\$\{NO1_PROGID_PREFIX\}\\Capabilities"/u)
  assert.match(hooks, /Software\\\$\{NO1_PROGID_PREFIX\}\\Capabilities\\FileAssociations" "\.md" "\$\{NO1_PROGID_PREFIX\}\.md"/u)
  assert.match(hooks, /Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\\$\{MAINBINARYNAME\}\.exe/u)
  assert.match(hooks, /!macro NSIS_HOOK_POSTINSTALL/u)
  assert.match(hooks, /!macro NSIS_HOOK_POSTUNINSTALL/u)
  assert.equal((hooks.match(/!insertmacro UPDATEFILEASSOC/gu) ?? []).length, 2)
})

test('NSIS installer reclaims stale "<ext>_auto_file" associations on install', async () => {
  const hooks = await readFile(
    new URL('../src-tauri/nsis/association-hooks.nsh', import.meta.url),
    'utf8'
  )

  // The reclaim macro repoints the extension default at our stable ProgId and
  // removes the orphaned generated ProgId left by an older install.
  assert.match(hooks, /!macro NO1_RECLAIM_AUTOFILE_EXTENSION ROOTKEY EXT/u)
  assert.match(hooks, /StrCmp \$0 "\$\{EXT\}_auto_file" 0 \+4/u)
  assert.match(
    hooks,
    /WriteRegStr \$\{ROOTKEY\} "Software\\Classes\\\.\$\{EXT\}" "" "\$\{NO1_PROGID_PREFIX\}\.\$\{EXT\}"/u
  )
  assert.match(hooks, /DeleteRegKey \$\{ROOTKEY\} "Software\\Classes\\\$\{EXT\}_auto_file"/u)

  // Cleanup runs during install, before the shell association refresh.
  assert.match(hooks, /!macro NO1_CLEANUP_STALE_FILE_ASSOCIATIONS/u)
  const postinstall = hooks.slice(
    hooks.indexOf('!macro NSIS_HOOK_POSTINSTALL'),
    hooks.indexOf('!macroend', hooks.indexOf('!macro NSIS_HOOK_POSTINSTALL'))
  )
  assert.match(postinstall, /!insertmacro NO1_CLEANUP_STALE_FILE_ASSOCIATIONS/u)
  assert.ok(
    postinstall.indexOf('NO1_CLEANUP_STALE_FILE_ASSOCIATIONS') <
      postinstall.indexOf('UPDATEFILEASSOC'),
    'stale associations should be reclaimed before the shell association cache is refreshed'
  )

  // Only the markdown extensions we own are reclaimed, across both registry
  // hives; ".txt" is deliberately excluded so we never hijack another editor's
  // generated txt_auto_file handler.
  const cleanup = hooks.slice(
    hooks.indexOf('!macro NO1_CLEANUP_STALE_FILE_ASSOCIATIONS'),
    hooks.indexOf('!macroend', hooks.indexOf('!macro NO1_CLEANUP_STALE_FILE_ASSOCIATIONS'))
  )
  for (const hive of ['HKCU', 'HKLM']) {
    for (const ext of ['md', 'markdown', 'mdx']) {
      assert.match(
        cleanup,
        new RegExp(`!insertmacro NO1_RECLAIM_AUTOFILE_EXTENSION ${hive} "${ext}"`, 'u')
      )
    }
  }
  assert.doesNotMatch(cleanup, /NO1_RECLAIM_AUTOFILE_EXTENSION \w+ "txt"/u)
})

test('Windows file association diagnostics check UserChoice, default classes, and Default Apps registration', async () => {
  const source = await readFile(
    new URL('../scripts/diagnose-windows-file-associations.ps1', import.meta.url),
    'utf8'
  )

  assert.match(source, /FileExts\\\$Extension\\UserChoice/u)
  assert.match(source, /No1MarkdownEditor\.\$extensionWithoutDot/u)
  assert.match(source, /Applications\\\$BinaryName/u)
  assert.match(source, /Software\\RegisteredApplications/u)
  assert.match(source, /CapabilitiesPath/u)
  assert.match(source, /\\FileAssociations/u)
  assert.match(source, /\\shell\\open\\command/u)
  assert.match(source, /HasPathArgument/u)
  assert.match(source, /ExecutableExists/u)
  assert.match(source, /UserChoice points to Applications\\\$BinaryName/u)
  assert.match(source, /Windows will prefer that protected user default/u)
  assert.match(source, /Default Apps registration does not advertise/u)
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
