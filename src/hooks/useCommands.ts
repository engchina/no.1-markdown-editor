import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/editor'
import { useFileOps } from './useFileOps'
import { useExport } from './useExport'
import { applyTheme, getThemeById, THEMES } from '../themes'
import type { Language } from '../i18n'

export interface Command {
  id: string
  label: string
  description?: string
  icon?: string
  category: 'file' | 'edit' | 'view' | 'theme' | 'export' | 'language'
  shortcut?: string
  action: () => void
}

export function useCommands(): Command[] {
  const { t } = useTranslation()
  const store = useEditorStore()
  const { newFile, openFile, saveFile, saveFileAs } = useFileOps()
  const { exportHtml, exportPdf, exportMarkdown } = useExport()

  return useMemo<Command[]>(() => [
    // ── File ──────────────────────────────────────────────────────────────
    {
      id: 'file.new',
      label: t('menu.newFile'),
      icon: '📄',
      category: 'file',
      shortcut: 'Ctrl+N',
      action: newFile,
    },
    {
      id: 'file.open',
      label: t('menu.openFile'),
      icon: '📂',
      category: 'file',
      shortcut: 'Ctrl+O',
      action: openFile,
    },
    {
      id: 'file.save',
      label: t('menu.saveFile'),
      icon: '💾',
      category: 'file',
      shortcut: 'Ctrl+S',
      action: saveFile,
    },
    {
      id: 'file.saveAs',
      label: t('menu.saveAs'),
      icon: '💾',
      category: 'file',
      shortcut: 'Ctrl+Shift+S',
      action: saveFileAs,
    },
    // ── View ──────────────────────────────────────────────────────────────
    {
      id: 'view.source',
      label: 'View: Source Mode',
      icon: '⌨',
      category: 'view',
      action: () => store.setViewMode('source'),
    },
    {
      id: 'view.split',
      label: 'View: Split Mode',
      icon: '⬛',
      category: 'view',
      action: () => store.setViewMode('split'),
    },
    {
      id: 'view.preview',
      label: 'View: Preview Mode',
      icon: '👁',
      category: 'view',
      action: () => store.setViewMode('preview'),
    },
    {
      id: 'view.focus',
      label: 'View: Focus Mode',
      icon: '🎯',
      category: 'view',
      shortcut: 'F11',
      action: () => store.setFocusMode(!store.focusMode),
    },
    {
      id: 'view.wysiwyg',
      label: `${store.wysiwygMode ? 'Disable' : 'Enable'} WYSIWYG Live Preview`,
      icon: '✨',
      category: 'view',
      action: () => store.setWysiwygMode(!store.wysiwygMode),
    },
    {
      id: 'view.sidebar',
      label: `${store.sidebarOpen ? 'Hide' : 'Show'} Sidebar`,
      icon: '📋',
      category: 'view',
      shortcut: 'Ctrl+\\',
      action: () => store.setSidebarOpen(!store.sidebarOpen),
    },
    {
      id: 'view.lineNumbers',
      label: `${store.lineNumbers ? 'Hide' : 'Show'} Line Numbers`,
      icon: '🔢',
      category: 'view',
      action: () => store.setLineNumbers(!store.lineNumbers),
    },
    {
      id: 'view.wordWrap',
      label: `${store.wordWrap ? 'Disable' : 'Enable'} Word Wrap`,
      icon: '↩',
      category: 'view',
      action: () => store.setWordWrap(!store.wordWrap),
    },
    {
      id: 'view.typewriter',
      label: `${store.typewriterMode ? 'Disable' : 'Enable'} Typewriter Mode`,
      icon: '🖊',
      category: 'view',
      action: () => store.setTypewriterMode(!store.typewriterMode),
    },
    {
      id: 'view.fontSizeIncrease',
      label: 'Increase Font Size',
      icon: 'A+',
      category: 'view',
      shortcut: 'Ctrl++',
      action: () => store.setFontSize(Math.min(store.fontSize + 1, 24)),
    },
    {
      id: 'view.fontSizeDecrease',
      label: 'Decrease Font Size',
      icon: 'A-',
      category: 'view',
      shortcut: 'Ctrl+-',
      action: () => store.setFontSize(Math.max(store.fontSize - 1, 11)),
    },
    {
      id: 'view.fontSizeReset',
      label: 'Reset Font Size',
      icon: 'A',
      category: 'view',
      shortcut: 'Ctrl+0',
      action: () => store.setFontSize(14),
    },
    // ── Edit ──────────────────────────────────────────────────────────────
    {
      id: 'edit.find',
      label: 'Find in Document',
      icon: '🔍',
      category: 'edit',
      shortcut: 'Ctrl+F',
      action: () => document.dispatchEvent(new CustomEvent('editor:search', { detail: { replace: false } })),
    },
    {
      id: 'edit.replace',
      label: 'Find & Replace',
      icon: '🔄',
      category: 'edit',
      shortcut: 'Ctrl+H',
      action: () => document.dispatchEvent(new CustomEvent('editor:search', { detail: { replace: true } })),
    },
    // ── Export ────────────────────────────────────────────────────────────
    {
      id: 'export.html',
      label: 'Export as HTML',
      icon: '🌐',
      category: 'export',
      action: exportHtml,
    },
    {
      id: 'export.pdf',
      label: 'Export as PDF',
      icon: '📄',
      category: 'export',
      action: exportPdf,
    },
    {
      id: 'export.markdown',
      label: 'Export Markdown',
      icon: '📝',
      category: 'export',
      action: exportMarkdown,
    },
    // ── Themes ────────────────────────────────────────────────────────────
    ...THEMES.map((theme) => ({
      id: `theme.${theme.id}`,
      label: `Theme: ${theme.name}`,
      icon: theme.dark ? '🌙' : '☀️',
      category: 'theme' as const,
      action: () => {
        store.setActiveThemeId(theme.id)
        applyTheme(getThemeById(theme.id))
      },
    })),
    // ── Language ──────────────────────────────────────────────────────────
    { id: 'lang.en', label: 'Language: English', icon: '🇬🇧', category: 'language', action: () => store.setLanguage('en' as Language) },
    { id: 'lang.ja', label: 'Language: 日本語', icon: '🇯🇵', category: 'language', action: () => store.setLanguage('ja' as Language) },
    { id: 'lang.zh', label: 'Language: 中文', icon: '🇨🇳', category: 'language', action: () => store.setLanguage('zh' as Language) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [store.wysiwygMode, store.sidebarOpen, store.focusMode, store.lineNumbers, store.wordWrap, store.typewriterMode, store.fontSize])
}
