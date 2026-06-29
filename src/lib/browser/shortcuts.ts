export const APP_BROWSER_SHORTCUT_EVENT = 'app-browser-shortcut'

export type AppBrowserShortcutCommand =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.close'
  | 'browser.new'
  | 'file.switchOpen'
  | 'view.commandPalette'
  | 'ai.open'
  | 'ai.setup'
  | 'help.keyboardShortcuts'
  | 'view.appearance'
  | 'edit.imageHosting'
  | 'edit.captureScreenshot'
  | 'view.toggleFocus'
  | 'view.toggleSidebar'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.zoomReset'

export interface AppBrowserShortcutPayload {
  command: AppBrowserShortcutCommand
  repeat?: boolean
}
