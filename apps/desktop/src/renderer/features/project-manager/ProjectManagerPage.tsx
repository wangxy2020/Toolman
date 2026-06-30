import { ConfigProvider, theme } from 'antd'
import { RotateCcw } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { CommunityPanelSecondaryButton } from '../community/CommunityPanelHeader'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import CostManagementDashboard from './CostManagementDashboard'
import ProgressManagementDashboard from './ProgressManagementDashboard'
import { ProjectManagerPanelShell } from './ProjectManagerPanelShell'
import { ProjectManagerPanelToolbar } from './ProjectManagerPanelToolbar'
import type { ProjectManagerPanelView } from './projectManagerPanelView'
import {
  PROJECT_SIDEBAR_CUSTOM_TAB,
  PROJECT_SIDEBAR_MENU_LABELS,
  type ConfigurableSidebarMenuKey,
  type ProjectSidebarMenuTab,
} from './projectSidebarMenuConfig'
import ProjectSidebarMenuSettings from './ProjectSidebarMenuSettings'
import { useProjectSidebarMenuPreferences } from './useProjectSidebarMenuPreferences'

interface Props {
  activeTab: ProjectSidebarMenuTab
}

const PANEL_SUBTITLES: Record<ConfigurableSidebarMenuKey, string> = {
  all_projects: '项目工作台总览与快捷入口',
  urgent_tasks: '待办任务、预警与需跟进事项',
  key_projects: '重点项目与综合管理视图',
  progress_management: '多项目 EPC 进度全景 · 计划、里程碑与偏差一目了然',
  cost_management: '多项目 EPC 成本全景 · 合同、结算与支付一目了然',
  resource_management: '人力、设备与物料资源统筹',
  security_management: '安全质量检查与整改跟踪',
  quality_management: '测量试验记录与质量验收',
  archive_management: '项目档案归档与检索',
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
        label: PROJECT_SIDEBAR_MENU_LABELS[key],
      })),
    [preferences.order],
  )

  const hiddenMenuKeys = useMemo(() => new Set(preferences.hidden), [preferences.hidden])

  const activeMenuLabel =
    activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
      ? '自定义'
      : PROJECT_SIDEBAR_MENU_LABELS[activeTab as keyof typeof PROJECT_SIDEBAR_MENU_LABELS]

  const panelSubtitle =
    activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
      ? '配置项目管理左侧菜单的显示与顺序'
      : PANEL_SUBTITLES[activeTab as ConfigurableSidebarMenuKey] ??
        '该子模块界面预留，当前为 MOCK 数据阶段'

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
        return <CostManagementDashboard viewMode="stats" searchKeyword="" />
      }
      if (showProgressDashboard) {
        return <ProgressManagementDashboard viewMode="stats" searchKeyword="" />
      }
      return (
        <div className="tm-kb-file-panel-empty">
          <p>选择左侧「成本管理」或「计划管理」查看看板 MOCK 数据。</p>
        </div>
      )
    }

    const reservedHints: Record<Exclude<ProjectManagerPanelView, 'stats'>, string> = {
      agent: 'Phase 3 将在此嵌入计划/成本智能体（EPC 工作流）。',
      files: '项目文件与关联文档管理界面预留，当前为 MOCK 数据阶段。',
      database: '项目数据库同步与查询界面预留，当前为 MOCK 数据阶段。',
      settings: '模块级设置界面预留，当前可通过侧栏「自定义」配置菜单。',
    }

    return (
      <div className="tm-kb-file-panel-empty">
        <p>{reservedHints[panelView]}</p>
      </div>
    )
  })()

  return (
    <ConfigProvider
      theme={{
        algorithm: document.documentElement.classList.contains('theme-dark')
          ? theme.darkAlgorithm
          : theme.defaultAlgorithm,
        token: { colorPrimary: '#00a870', borderRadius: 8 },
      }}>
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
                  title="恢复默认"
                  ariaLabel="恢复默认"
                  onClick={resetToDefaults}
                >
                  <RotateCcw size={16} />
                  <span>恢复默认</span>
                </CommunityPanelSecondaryButton>
              ) : undefined
            }>
            {panelBody}
          </ProjectManagerPanelShell>
        </div>
        <ModulePageStatusBar />
      </main>
    </ConfigProvider>
  )
}

export default ProjectManagerPage
