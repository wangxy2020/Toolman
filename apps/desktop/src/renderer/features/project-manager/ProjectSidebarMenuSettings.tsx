import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import type { FC } from 'react'

import { useI18n } from '../../i18n/useI18n'
import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'

interface MenuRowMeta {
  key: ConfigurableSidebarMenuKey
  label: string
}

interface Props {
  menuRows: MenuRowMeta[]
  hiddenKeys: Set<ConfigurableSidebarMenuKey>
  onVisibleChange: (key: ConfigurableSidebarMenuKey, visible: boolean) => void
  onMove: (key: ConfigurableSidebarMenuKey, direction: 'up' | 'down') => void
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template,
  )
}

const ProjectSidebarMenuSettings: FC<Props> = ({ menuRows, hiddenKeys, onVisibleChange, onMove }) => {
  const { t } = useI18n()
  const visibleCount = menuRows.filter((row) => !hiddenKeys.has(row.key)).length

  return (
    <div className="tm-pm-settings">
      <div className="tm-pm-settings-inner">
        <div className="tm-pm-settings-card">
          <h3 className="tm-pm-settings-title">
            {interpolate(t('projectManagerPage.settings.menuTitle'), {
              visible: visibleCount,
              total: menuRows.length,
            })}
          </h3>
          <div className="tm-pm-settings-list">
            {menuRows.map((row, index) => {
              const visible = !hiddenKeys.has(row.key)
              return (
                <div key={row.key} className="tm-pm-settings-row">
                  <span className="tm-pm-settings-drag" aria-hidden>
                    <GripVertical size={14} />
                  </span>
                  <span className="tm-pm-settings-label">{row.label}</span>
                  <div className="tm-pm-settings-actions">
                    <div className="tm-pm-settings-toggle-wrap">
                      <span className="tm-pm-settings-toggle-label">
                        {visible ? t('projectManagerPage.settings.show') : t('projectManagerPage.settings.hide')}
                      </span>
                      <button
                        type="button"
                        className={['tm-agent-toggle', visible ? 'tm-agent-toggle--on' : '']
                          .filter(Boolean)
                          .join(' ')}
                        aria-label={
                          visible
                            ? t('projectManagerPage.settings.hide')
                            : t('projectManagerPage.settings.show')
                        }
                        aria-pressed={visible}
                        onClick={() => onVisibleChange(row.key, !visible)}>
                        <span className="tm-agent-toggle-thumb" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="tm-pm-settings-icon-btn"
                      disabled={index === 0}
                      aria-label={t('projectManagerPage.settings.moveUp')}
                      onClick={() => onMove(row.key, 'up')}>
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="tm-pm-settings-icon-btn"
                      disabled={index === menuRows.length - 1}
                      aria-label={t('projectManagerPage.settings.moveDown')}
                      onClick={() => onMove(row.key, 'down')}>
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="tm-pm-settings-hint">
          <h4 className="tm-pm-settings-hint-title">{t('projectManagerPage.settings.hintTitle')}</h4>
          <ul className="tm-pm-settings-hint-list">
            <li>{t('projectManagerPage.settings.hintItem1')}</li>
            <li>{t('projectManagerPage.settings.hintItem2')}</li>
            <li>{t('projectManagerPage.settings.hintItem3')}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ProjectSidebarMenuSettings
