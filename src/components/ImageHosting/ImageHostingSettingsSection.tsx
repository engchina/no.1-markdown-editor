import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createDefaultImageHostingConfig,
  type ImageHostingConfig,
} from '../../lib/imageHosting/types'
import { isImageHostingDesktopAvailable } from '../../lib/imageHosting/client'
import { openUpdateUrl } from '../../lib/update'
import { pushErrorNotice, pushSuccessNotice } from '../../lib/notices'
import { useImageHostingStore } from '../../store/imageHosting'
import AppIcon from '../Icons/AppIcon'

const GITHUB_NEW_REPO_URL =
  'https://github.com/new?name=markdown-images&description=Image%20host%20for%20Markdown%20articles&visibility=public'
const GITHUB_FINE_GRAINED_PAT_URL = 'https://github.com/settings/personal-access-tokens/new'

interface ImageHostingSettingsSectionProps {
  showSectionLabel?: boolean
}

export default function ImageHostingSettingsSection({
  showSectionLabel = true,
}: ImageHostingSettingsSectionProps) {
  const { t } = useTranslation()
  const state = useImageHostingStore((s) => s.state)
  const loading = useImageHostingStore((s) => s.loading)
  const saving = useImageHostingStore((s) => s.saving)
  const verifying = useImageHostingStore((s) => s.verifying)
  const lastVerifiedRepo = useImageHostingStore((s) => s.lastVerifiedRepo)
  const load = useImageHostingStore((s) => s.load)
  const saveConfig = useImageHostingStore((s) => s.saveConfig)
  const savePat = useImageHostingStore((s) => s.savePat)
  const clearPat = useImageHostingStore((s) => s.clearPat)
  const verify = useImageHostingStore((s) => s.verify)

  const desktopAvailable = isImageHostingDesktopAvailable()

  const [draftConfig, setDraftConfig] = useState<ImageHostingConfig>(
    () => state?.config ?? createDefaultImageHostingConfig()
  )
  const [patInput, setPatInput] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (state) setDraftConfig(state.config)
  }, [state])

  const hasPat = state?.hasPat ?? false
  const dirty = state ? !configEquals(state.config, draftConfig) : true

  async function onSubmitConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveConfig(draftConfig)
      pushSuccessNotice(
        'imageHosting.notices.configSavedTitle',
        'imageHosting.notices.configSavedMessage'
      )
    } catch (error) {
      pushErrorNotice(
        'imageHosting.notices.configSaveErrorTitle',
        'imageHosting.notices.configSaveErrorMessage',
        { values: { reason: errorMessage(error) } }
      )
    }
  }

  async function onSavePat() {
    const trimmed = patInput.trim()
    if (!trimmed) return
    try {
      await savePat(trimmed)
      setPatInput('')
      pushSuccessNotice(
        'imageHosting.notices.patSavedTitle',
        'imageHosting.notices.patSavedMessage'
      )
    } catch (error) {
      pushErrorNotice(
        'imageHosting.notices.patSaveErrorTitle',
        'imageHosting.notices.patSaveErrorMessage',
        { values: { reason: errorMessage(error) } }
      )
    }
  }

  async function onClearPat() {
    try {
      await clearPat()
      pushSuccessNotice(
        'imageHosting.notices.patClearedTitle',
        'imageHosting.notices.patClearedMessage'
      )
    } catch (error) {
      pushErrorNotice(
        'imageHosting.notices.patClearErrorTitle',
        'imageHosting.notices.patClearErrorMessage',
        { values: { reason: errorMessage(error) } }
      )
    }
  }

  async function onVerify() {
    try {
      await verify()
      pushSuccessNotice(
        'imageHosting.notices.verifyOkTitle',
        'imageHosting.notices.verifyOkMessage',
        { values: { repo: lastVerifiedRepo ?? `${draftConfig.owner}/${draftConfig.repo}` } }
      )
    } catch (error) {
      pushErrorNotice(
        'imageHosting.notices.verifyFailedTitle',
        'imageHosting.notices.verifyFailedMessage',
        { values: { reason: errorMessage(error) } }
      )
    }
  }

  function updateField<K extends keyof ImageHostingConfig>(key: K, value: ImageHostingConfig[K]) {
    setDraftConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div data-image-hosting-settings="true">
      {showSectionLabel && (
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
          {t('imageHosting.sectionLabel')}
        </p>
      )}

      <div
        className="space-y-4 rounded-[1.25rem] px-4 py-4"
        style={{
          border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        }}
      >
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('imageHosting.title')}
          </div>
          <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
            {t('imageHosting.description')}
          </div>
        </div>

        {!desktopAvailable && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--warning, #f59e0b) 14%, transparent)',
              color: 'var(--text-secondary)',
            }}
          >
            {t('imageHosting.desktopOnly')}
          </div>
        )}

        <div
          className="space-y-2 rounded-xl px-3 py-3"
          style={{
            border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            background: 'color-mix(in srgb, var(--bg-tertiary) 50%, transparent)',
          }}
        >
          <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('imageHosting.pat.title')}
          </div>
          <div className="text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
            {hasPat ? t('imageHosting.pat.savedDescription') : t('imageHosting.pat.missingDescription')}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={patInput}
              onChange={(event) => setPatInput(event.target.value)}
              placeholder={t('imageHosting.pat.inputPlaceholder')}
              disabled={!desktopAvailable}
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-xs"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
              }}
            />
            <button
              type="button"
              onClick={() => void onSavePat()}
              disabled={!desktopAvailable || saving || patInput.trim().length === 0}
              className="rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {t('imageHosting.pat.save')}
            </button>
            {hasPat && (
              <button
                type="button"
                onClick={() => void onClearPat()}
                disabled={!desktopAvailable || saving}
                className="rounded-xl border px-3 py-2 text-xs transition-colors disabled:opacity-60"
                style={{
                  borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('imageHosting.pat.clear')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <ExternalLinkButton
              icon="globe"
              label={t('imageHosting.pat.openGithubNewRepo')}
              onClick={() => void openUpdateUrl(GITHUB_NEW_REPO_URL)}
            />
            <ExternalLinkButton
              icon="link"
              label={t('imageHosting.pat.openGithubPatPage')}
              onClick={() => void openUpdateUrl(GITHUB_FINE_GRAINED_PAT_URL)}
            />
          </div>
        </div>

        <form className="space-y-3" onSubmit={onSubmitConfig}>
          <label className="flex items-center justify-between cursor-pointer gap-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('imageHosting.enableToggle')}
            </span>
            <button
              type="button"
              disabled={!desktopAvailable || loading}
              onClick={() => updateField('enabled', !draftConfig.enabled)}
              className="relative rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
              style={{
                width: '36px',
                height: '20px',
                background: draftConfig.enabled ? 'var(--accent)' : 'var(--bg-tertiary)',
              }}
            >
              <span
                className="absolute top-0.5 rounded-full transition-transform"
                style={{
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  left: draftConfig.enabled ? '18px' : '2px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </label>

          <FieldRow
            label={t('imageHosting.fields.owner')}
            value={draftConfig.owner}
            placeholder={t('imageHosting.placeholders.owner')}
            onChange={(v) => updateField('owner', v)}
            disabled={!desktopAvailable}
          />
          <FieldRow
            label={t('imageHosting.fields.repo')}
            value={draftConfig.repo}
            placeholder={t('imageHosting.placeholders.repo')}
            onChange={(v) => updateField('repo', v)}
            disabled={!desktopAvailable}
          />
          <FieldRow
            label={t('imageHosting.fields.branch')}
            value={draftConfig.branch}
            placeholder="main"
            onChange={(v) => updateField('branch', v)}
            disabled={!desktopAvailable}
          />
          <FieldRow
            label={t('imageHosting.fields.directory')}
            value={draftConfig.directory}
            placeholder="images"
            onChange={(v) => updateField('directory', v)}
            disabled={!desktopAvailable}
          />
          <FieldRow
            label={t('imageHosting.fields.commitMessage')}
            value={draftConfig.commitMessageTemplate}
            placeholder={t('imageHosting.placeholders.commitMessage')}
            onChange={(v) => updateField('commitMessageTemplate', v)}
            disabled={!desktopAvailable}
            hint={t('imageHosting.fields.commitMessageHint')}
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={!desktopAvailable || saving || !dirty}
              className="rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {saving ? t('imageHosting.actions.saving') : t('imageHosting.actions.saveConfig')}
            </button>
            <button
              type="button"
              onClick={() => void onVerify()}
              disabled={!desktopAvailable || verifying || !hasPat || !draftConfig.owner || !draftConfig.repo}
              className="rounded-xl border px-3 py-2 text-xs transition-colors disabled:opacity-60"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'transparent',
                color: 'var(--text-secondary)',
              }}
            >
              {verifying ? t('imageHosting.actions.verifying') : t('imageHosting.actions.verify')}
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => setShowInstructions((open) => !open)}
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <AppIcon name={showInstructions ? 'chevronDown' : 'chevronRight'} size={12} />
          <span>
            {showInstructions
              ? t('imageHosting.instructions.hide')
              : t('imageHosting.instructions.show')}
          </span>
        </button>

        {showInstructions && (
          <ol
            className="space-y-2 rounded-xl px-4 py-3 text-xs leading-5 list-decimal list-inside"
            style={{
              background: 'color-mix(in srgb, var(--bg-tertiary) 40%, transparent)',
              color: 'var(--text-secondary)',
            }}
          >
            <li>{t('imageHosting.instructions.step1')}</li>
            <li>{t('imageHosting.instructions.step2')}</li>
            <li>{t('imageHosting.instructions.step3')}</li>
            <li>{t('imageHosting.instructions.step4')}</li>
            <li>{t('imageHosting.instructions.step5')}</li>
            <li>{t('imageHosting.instructions.step6')}</li>
            <li>{t('imageHosting.instructions.step7')}</li>
            <li>{t('imageHosting.instructions.step8')}</li>
          </ol>
        )}
      </div>
    </div>
  )
}

interface FieldRowProps {
  label: string
  value: string
  placeholder?: string
  hint?: string
  disabled?: boolean
  onChange: (value: string) => void
}

function FieldRow({ label, value, placeholder, hint, disabled, onChange }: FieldRowProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg px-3 py-2 text-xs"
        style={{
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
        }}
      />
      {hint && (
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

interface ExternalLinkButtonProps {
  icon: 'globe' | 'link'
  label: string
  onClick: () => void
}

function ExternalLinkButton({ icon, label, onClick }: ExternalLinkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)',
        background: 'transparent',
        color: 'var(--text-secondary)',
      }}
    >
      <span className="flex items-center gap-1.5">
        <AppIcon name={icon} size={12} />
        <span>{label}</span>
      </span>
    </button>
  )
}

function configEquals(a: ImageHostingConfig, b: ImageHostingConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.owner === b.owner &&
    a.repo === b.repo &&
    a.branch === b.branch &&
    a.directory === b.directory &&
    a.commitMessageTemplate === b.commitMessageTemplate
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
