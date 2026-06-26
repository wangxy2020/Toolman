import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type SkillInfo } from '@toolman/shared'
import { IconPlus, IconSearch } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { resolveSkillDescription } from '../../i18n/settings-labels'

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
    </button>
  )
}

interface Props {
  skillIds: string[]
  onSkillToggle: (skillId: string, enabled: boolean) => void
  onInstallSkill?: () => void
}

export function AgentSettingsSkillsTab({ skillIds, onSkillToggle, onInstallSkill }: Props) {
  const { t } = useI18n()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.SkillList, {})
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: SkillInfo[] }
    setSkills(data.items)
    setError(null)
  }, [])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const items = [...skills].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    if (!normalized) return items
    return items.filter(
      (skill) =>
        skill.name.toLowerCase().includes(normalized) ||
        skill.description.toLowerCase().includes(normalized),
    )
  }, [query, skills])

  const handleInstall = useCallback(async () => {
    if (onInstallSkill) {
      onInstallSkill()
      return
    }

    setInstalling(true)
    setError(null)
    try {
      const pickResult = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
      if (!pickResult.ok) {
        setError(pickResult.error.message)
        return
      }
      const { path } = pickResult.data as { path: string | null }
      if (!path) return

      const installResult = await window.api.invoke(IpcChannel.SkillInstall, { sourcePath: path })
      if (!installResult.ok) {
        setError(installResult.error.message)
        return
      }
      await loadSkills()
    } finally {
      setInstalling(false)
    }
  }, [loadSkills, onInstallSkill])

  return (
    <div className="tm-agent-tab-panel">
      {error ? <div className="tm-settings-error">{error}</div> : null}

      <div className="tm-agent-tab-head">
        <h3 className="tm-agent-tab-title">
          {t('agent.skills.installed')}
          <button
            type="button"
            className="tm-agent-tab-search"
            title={t('agent.skills.search')}
            onClick={() => {
              const next = window.prompt(t('agent.skills.searchPrompt'), query)
              if (next != null) setQuery(next)
            }}
          >
            <IconSearch size={14} />
          </button>
        </h3>
        <button
          type="button"
          className="tm-agent-skill-add"
          disabled={installing}
          title={installing ? t('agent.skills.installing') : t('agent.skills.addMore')}
          onClick={() => void handleInstall()}
        >
          <IconPlus size={14} className={installing ? 'tm-icon-spin' : undefined} />
          {installing ? t('agent.skills.installing') : t('agent.skills.addMore')}
        </button>
      </div>

      {query ? (
        <div className="tm-agent-skill-search-hint">{t('agent.skills.searchResult', { query })}</div>
      ) : null}
      {loading ? <div className="tm-settings-loading">{t('agent.skills.loading')}</div> : null}

      <div className="tm-skill-list">
        {filteredSkills.map((skill) => {
          const enabled = skillIds.includes(skill.id)
          return (
            <div key={skill.id} className="tm-skill-card">
              <div className="tm-skill-card-main">
                <div className="tm-skill-card-name">{skill.name}</div>
                <div className="tm-skill-card-desc">{resolveSkillDescription(skill, t)}</div>
                <div className="tm-skill-card-meta">
                  {skill.builtin ? <span className="tm-skill-badge">{t('agent.skills.builtin')}</span> : null}
                  <span className={`tm-tool-tag ${enabled ? 'tm-tool-tag--on' : 'tm-tool-tag--off'}`}>
                    {enabled ? t('agent.skills.mounted') : t('agent.skills.unmounted')}
                  </span>
                </div>
              </div>
              <Toggle checked={enabled} onChange={(value) => onSkillToggle(skill.id, value)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
