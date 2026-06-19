import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type SkillInfo } from '@toolman/shared'
import { IconMinus, IconPlus } from '../../components/icons'
import { SettingsPageLayout, SettingsSection } from './SettingsShared'

function sortSkillsByName(skills: SkillInfo[]): SkillInfo[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function SkillsSettingsPanel() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sortedSkills = useMemo(() => sortSkillsByName(skills), [skills])

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

  const handleInstall = useCallback(async () => {
    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
    if (!pickResult.ok) return
    const { path } = pickResult.data as { path: string | null }
    if (!path) return

    const installResult = await window.api.invoke(IpcChannel.SkillInstall, { sourcePath: path })
    if (!installResult.ok) {
      setError(installResult.error.message)
      return
    }
    await loadSkills()
  }, [loadSkills])

  const handleDelete = useCallback(
    async (skill: SkillInfo) => {
      if (skill.builtin) return
      if (!window.confirm(`确定删除技能「${skill.name}」？`)) return

      const result = await window.api.invoke(IpcChannel.SkillDelete, { id: skill.id })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      await loadSkills()
    },
    [loadSkills],
  )

  return (
    <SettingsPageLayout>
      {error ? <div className="tm-settings-error">{error}</div> : null}
      {loading ? <div className="tm-settings-loading">加载中…</div> : null}

      <SettingsSection
        title="技能"
        intro="已安装的技能可在智能体设置中按需挂载；运行时会把 SKILL.md 内容注入系统提示。"
        action={
          <button type="button" className="tm-mcp-add-btn" onClick={() => void handleInstall()}>
            <IconPlus size={14} />
            添加
          </button>
        }
      >
        {sortedSkills.length > 0 ? (
          <div className="tm-mcp-server-list">
            {sortedSkills.map((skill) => (
              <div key={skill.id} className="tm-mcp-server-card">
                <div className="tm-mcp-server-main">
                  <div className="tm-mcp-server-head">
                    <span className="tm-mcp-server-name">{skill.name}</span>
                    {skill.builtin ? <span className="tm-skill-badge">内置</span> : null}
                  </div>
                  <div className="tm-mcp-server-desc">{skill.description}</div>
                </div>
                <div className="tm-mcp-server-actions">
                  {!skill.builtin ? (
                    <button
                      type="button"
                      className="tm-provider-icon-btn tm-provider-icon-btn--danger"
                      title="删除技能"
                      onClick={() => void handleDelete(skill)}
                    >
                      <IconMinus size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tm-mcp-empty-hint">暂无技能，点击「添加」从本地文件夹安装（需包含 SKILL.md）。</div>
        )}
      </SettingsSection>
    </SettingsPageLayout>
  )
}
