import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type SkillInfo } from '@toolman/shared'
import { IconPlus, IconSearch } from '../../components/icons'

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
          已安装技能
          <button
            type="button"
            className="tm-agent-tab-search"
            title="搜索技能"
            onClick={() => {
              const next = window.prompt('搜索技能', query)
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
          title={installing ? '安装中…' : '添加更多技能'}
          onClick={() => void handleInstall()}
        >
          <IconPlus size={14} className={installing ? 'tm-icon-spin' : undefined} />
          {installing ? '安装中…' : '添加更多技能'}
        </button>
      </div>

      {query ? <div className="tm-agent-skill-search-hint">搜索：{query}</div> : null}
      {loading ? <div className="tm-settings-loading">加载技能…</div> : null}

      <div className="tm-skill-list">
        {filteredSkills.map((skill) => {
          const enabled = skillIds.includes(skill.id)
          return (
            <div key={skill.id} className="tm-skill-card">
              <div className="tm-skill-card-main">
                <div className="tm-skill-card-name">{skill.name}</div>
                <div className="tm-skill-card-desc">{skill.description}</div>
                <div className="tm-skill-card-meta">
                  {skill.builtin ? <span className="tm-skill-badge">内置</span> : null}
                  <span className={`tm-tool-tag ${enabled ? 'tm-tool-tag--on' : 'tm-tool-tag--off'}`}>
                    {enabled ? '已挂载' : '未挂载'}
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
