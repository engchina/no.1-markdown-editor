import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore, useActiveTab, type SidebarTab } from '../../store/editor'
import FileTree from './FileTree'

interface Props {
  width: number
}

interface Heading {
  level: number
  text: string
  id: string
}

function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n')
  const headings: Heading[] = []
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        id: match[2].trim().toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]+/gi, '-'),
      })
    }
  }
  return headings
}

const TABS: { id: SidebarTab; icon: string; title: string }[] = [
  { id: 'outline', icon: '≡', title: 'Outline' },
  { id: 'files', icon: '📁', title: 'Explorer' },
  { id: 'search', icon: '🔍', title: 'Search' },
]

export default function Sidebar({ width }: Props) {
  const { sidebarTab, setSidebarTab } = useEditorStore()
  const activeTab = useActiveTab()
  const headings = useMemo(
    () => extractHeadings(activeTab?.content ?? ''),
    [activeTab?.content]
  )

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Tab icons */}
      <div
        className="flex items-center"
        style={{ borderBottom: '1px solid var(--border)', height: '36px' }}
      >
        {TABS.map(({ id, icon, title }) => (
          <button
            key={id}
            title={title}
            onClick={() => setSidebarTab(id)}
            className="flex-1 h-full text-sm transition-colors"
            style={{
              color: sidebarTab === id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: sidebarTab === id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {sidebarTab === 'outline' && (
          <OutlinePanel headings={headings} />
        )}
        {sidebarTab === 'files' && (
          <FileTree />
        )}
        {sidebarTab === 'search' && (
          <SearchPanel />
        )}
      </div>
    </div>
  )
}

function OutlinePanel({ headings }: { headings: Heading[] }) {
  const { t } = useTranslation()
  if (headings.length === 0) {
    return (
      <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
        {t('sidebar.noOutline')}
      </p>
    )
  }
  return (
    <ul className="space-y-0.5">
      {headings.map((h, i) => (
        <li
          key={i}
          className="flex items-center rounded-lg px-2 py-1 cursor-pointer text-xs transition-all hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:text-[var(--accent)] hover-scale"
          style={{
            paddingLeft: `${(h.level - 1) * 12 + 8}px`,
            color: h.level === 1 ? 'var(--text-primary)' : h.level === 2 ? 'var(--text-secondary)' : 'var(--text-muted)',
            fontWeight: h.level <= 2 ? 500 : 400,
          }}
          onClick={() => {
            // Scroll preview to heading
            const el = document.getElementById(h.id)
            el?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          <span
            className="mr-1 text-xs"
            style={{ color: 'var(--text-muted)', minWidth: '20px', fontFamily: 'monospace' }}
          >
            {'H' + h.level}
          </span>
          <span className="truncate">{h.text}</span>
        </li>
      ))}
    </ul>
  )
}


function SearchPanel() {
  return (
    <div>
      <input
        type="text"
        placeholder="Search..."
        className="w-full rounded px-2 py-1 text-xs outline-none"
        style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      />
      <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
        Search coming soon
      </p>
    </div>
  )
}
