import { RotateCcw } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { CommunityPanelSecondaryButton } from '../community/CommunityPanelHeader'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import ProjectManagementDashboard from './ProjectManagementDashboard'
import { ProjectManagerPanelShell } from './ProjectManagerPanelShell'
import { ProjectManagerPanelToolbar } from './ProjectManagerPanelToolbar'
import type { ProjectManagerPanelView } from './projectManagerPanelView'
import {
  isConfigurableSidebarMenuKey,
  PANEL_SUBTITLE_I18N_KEY,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  SIDEBAR_MENU_I18N_KEY,
} from './projectSidebarMenuConfig'
import ProjectSidebarMenuSettings from './ProjectSidebarMenuSettings'
import { useProjectSidebarMenuPreferences } from './useProjectSidebarMenuPreferences'

interface Props {
  activeTab: import('./projectSidebarMenuConfig').ProjectSidebarMenuTab
}

const ProjectManagerPage: FC<Props> = ({ activeTab }) => {
  const { t } = useI18n()
  const config = getModulePageConfig('projects', t)

  const { preferences, setMenuVisible, moveMenu, resetToDefaults } =
    useProjectSidebarMenuPreferences()

  const settingsMenuRows = useMemo(
    () =>
      preferences.order.map((key) => ({
        key,
        label: t(SIDEBAR_MENU_I18N_KEY[key]),
      })),
    [preferences.order, t],
  )

  const hiddenMenuKeys = useMemo(() => new Set(preferences.hidden), [preferences.hidden])

  const activeMenuLabel =
    activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
      ? t('projectManagerPage.panel.customizeTitle')
      : isConfigurableSidebarMenuKey(activeTab)
        ? t(SIDEBAR_MENU_I18N_KEY[activeTab])
        : ''

  const panelSubtitle =
    activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
      ? t('projectManagerPage.panel.customizeSubtitle')
      : isConfigurableSidebarMenuKey(activeTab)
        ? t(PANEL_SUBTITLE_I18N_KEY[activeTab])
        : t('projectManagerPage.panel.reservedDefault')

  const showCostDashboard = activeTab === 'cost_management'
  const showProgressDashboard = activeTab === 'progress_management'
  const showSidebarMenuSettings = activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
  const [panelView, setPanelView] = useState<ProjectManagerPanelView>('stats')

  useEffect(() => {
    setPanelView('stats')
  }, [activeTab])

  const panelBody = (() => {
    if (showSidebarMenuSettings) {
      return (
        <ProjectSidebarMenuSettings
          menuRows={settingsMenuRows}
          hiddenKeys={hiddenMenuKeys}
          onVisibleChange={setMenuVisible}
          onMove={moveMenu}
        />
      )
    }

    if (panelView === 'stats') {
      if (showCostDashboard) {
        return <ProjectManagementDashboard variant="cost" />
      }
      if (showProgressDashboard) {
        return <ProjectManagementDashboard variant="progress" />
      }
      return (
        <div className="tm-kb-file-panel-empty">
          <p>{t('projectManagerPage.panel.selectDashboardHint')}</p>
        </div>
      )
    }

    const reservedKey = panelView as Exclude<ProjectManagerPanelView, 'stats'>
    return (
      <div className="tm-kb-file-panel-empty">
        <p>{t(`projectManagerPage.panel.reserved.${reservedKey}`)}</p>
      </div>
    )
  })()

  return (
    <main className="tm-main tm-project-manager-page">
      <header className="tm-chat-header">
        <div className="tm-chat-breadcrumb">
          <span className="tm-model-pill tm-module-pill">{config.title}</span>
          <span className="tm-module-breadcrumb-group">
            <span className="tm-chat-breadcrumb-sep">/</span>
            <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
              {activeMenuLabel}
            </span>
          </span>
        </div>

        {!showSidebarMenuSettings ? (
          <div className="tm-chat-header-end">
            <ProjectManagerPanelToolbar activeView={panelView} onSelectView={setPanelView} />
          </div>
        ) : null}
      </header>

      <div className="tm-module-content tm-community-module-content">
        <ProjectManagerPanelShell
          title={activeMenuLabel}
          subtitle={panelSubtitle}
          actions={
            showSidebarMenuSettings ? (
              <CommunityPanelSecondaryButton
                title={t('projectManagerPage.panel.resetDefaults')}
                ariaLabel={t('projectManagerPage.panel.resetDefaults')}
                onClick={resetToDefaults}>
                <RotateCcw size={16} />
                <span>{t('projectManagerPage.panel.resetDefaults')}</span>
              </CommunityPanelSecondaryButton>
            ) : undefined
          }>
          {panelBody}
        </ProjectManagerPanelShell>
      </div>
      <ModulePageStatusBar />
    </main>
  )
}

export default ProjectManagerPage
