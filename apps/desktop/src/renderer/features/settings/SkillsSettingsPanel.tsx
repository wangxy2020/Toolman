import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type SkillInfo } from '@toolman/shared'
import { IconMinus, IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { resolveSkillDescription } from '../../i18n/settings-labels'
import { SettingsPageLayout, SettingsSection } from './SettingsShared'

function sortSkillsByName(skills: SkillInfo[]): SkillInfo[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function SkillsSettingsPanel() {
  const { t } = useI18n()
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
      if (!window.confirm(t('settings.skills.delete.confirm', { name: skill.name }))) return

      const result = await window.api.invoke(IpcChannel.SkillDelete, { id: skill.id })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      await loadSkills()
    },
    [loadSkills, t],
  )

  return (
    <SettingsPageLayout>
      {error ? <div className="tm-settings-error">{error}</div> : null}
      {loading ? <div className="tm-settings-loading">{t('common.loading')}</div> : null}

      <SettingsSection
        title={t('settings.skills.title')}
        intro={t('settings.skills.intro')}
        action={
          <button type="button" className="tm-mcp-add-btn" onClick={() => void handleInstall()}>
            <IconPlus size={14} />
            {t('common.add')}
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
                    {skill.builtin ? (
                      <span className="tm-skill-badge">{t('settings.skills.builtinBadge')}</span>
                    ) : null}
                  </div>
                  <div className="tm-mcp-server-desc">{resolveSkillDescription(skill, t)}</div>
                </div>
                <div className="tm-mcp-server-actions">
                  {!skill.builtin ? (
                    <button
                      type="button"
                      className="tm-provider-icon-btn tm-provider-icon-btn--danger"
                      title={t('settings.skills.delete.title')}
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
          <div className="tm-mcp-empty-hint">{t('settings.skills.empty')}</div>
        )}
      </SettingsSection>
    </SettingsPageLayout>
  )
}
