!define NO1_PROGID_PREFIX "No1MarkdownEditor"

!macro NO1_REGISTER_APPLICATION_FILE_OPEN_HANDLER
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe" "" "${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".md" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".mdx" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".txt" ""
!macroend

!macro NO1_REGISTER_DOCUMENT_PROGID EXT DESCRIPTION MIME
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "${NO1_PROGID_PREFIX}.${EXT}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "Content Type" "${MIME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "PerceivedType" "text"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${NO1_PROGID_PREFIX}.${EXT}" ""

  WriteRegStr SHELL_CONTEXT "Software\Classes\${NO1_PROGID_PREFIX}.${EXT}" "" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${NO1_PROGID_PREFIX}.${EXT}" "FriendlyTypeName" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${NO1_PROGID_PREFIX}.${EXT}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${NO1_PROGID_PREFIX}.${EXT}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${NO1_PROGID_PREFIX}.${EXT}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

  ; Keep compatibility with Tauri's generated product-name ProgId so existing
  ; Windows UserChoice records can still resolve after an upgrade.
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCTNAME}.${EXT}" "" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCTNAME}.${EXT}" "FriendlyTypeName" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCTNAME}.${EXT}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCTNAME}.${EXT}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCTNAME}.${EXT}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
!macroend

!macro NO1_REGISTER_DEFAULT_FILE_ASSOCIATIONS
  !insertmacro NO1_REGISTER_DOCUMENT_PROGID "md" "Markdown document" "text/markdown"
  !insertmacro NO1_REGISTER_DOCUMENT_PROGID "markdown" "Markdown document" "text/markdown"
  !insertmacro NO1_REGISTER_DOCUMENT_PROGID "mdx" "MDX document" "text/markdown"
  !insertmacro NO1_REGISTER_DOCUMENT_PROGID "txt" "Plain text document" "text/plain"
!macroend

!macro NO1_REGISTER_DEFAULT_APPS_CAPABILITIES
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCTNAME}" "Software\${NO1_PROGID_PREFIX}\Capabilities"
  WriteRegStr SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}\Capabilities" "ApplicationName" "${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}\Capabilities" "ApplicationDescription" "${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}\Capabilities" "ApplicationIcon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}\Capabilities\FileAssociations" ".md" "${NO1_PROGID_PREFIX}.md"
  WriteRegStr SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}\Capabilities\FileAssociations" ".markdown" "${NO1_PROGID_PREFIX}.markdown"
  WriteRegStr SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}\Capabilities\FileAssociations" ".mdx" "${NO1_PROGID_PREFIX}.mdx"
  WriteRegStr SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}\Capabilities\FileAssociations" ".txt" "${NO1_PROGID_PREFIX}.txt"

  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\${MAINBINARYNAME}.exe" "Path" "$INSTDIR"
!macroend

!macro NO1_UNREGISTER_DOCUMENT_PROGID EXT
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  StrCmp $0 "${NO1_PROGID_PREFIX}.${EXT}" 0 +2
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${NO1_PROGID_PREFIX}.${EXT}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${NO1_PROGID_PREFIX}.${EXT}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${PRODUCTNAME}.${EXT}"
!macroend

!macro NO1_UNREGISTER_DEFAULT_FILE_ASSOCIATIONS
  !insertmacro NO1_UNREGISTER_DOCUMENT_PROGID "md"
  !insertmacro NO1_UNREGISTER_DOCUMENT_PROGID "markdown"
  !insertmacro NO1_UNREGISTER_DOCUMENT_PROGID "mdx"
  !insertmacro NO1_UNREGISTER_DOCUMENT_PROGID "txt"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro NO1_REGISTER_APPLICATION_FILE_OPEN_HANDLER
  !insertmacro NO1_REGISTER_DEFAULT_FILE_ASSOCIATIONS
  !insertmacro NO1_REGISTER_DEFAULT_APPS_CAPABILITIES
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCTNAME}"
  DeleteRegKey SHELL_CONTEXT "Software\${NO1_PROGID_PREFIX}"
  DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\${MAINBINARYNAME}.exe"
  !insertmacro NO1_UNREGISTER_DEFAULT_FILE_ASSOCIATIONS
  !insertmacro UPDATEFILEASSOC
!macroend
