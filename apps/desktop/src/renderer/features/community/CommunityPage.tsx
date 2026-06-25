import { useState, useMemo, type ReactNode } from 'react'

import {
  IconKnowledge,
  IconMessageBoard,
  IconMcp,
  IconNews,
  IconRecommend,
  IconSkill,
  IconSliders,
  IconFlag,
  IconSubscribe,
  IconTaskList,
  IconWorkflow,
} from '../../components/icons'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { useI18n } from '../../i18n/useI18n'
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { ModulePageStatusProvider } from '../../components/module-page-status'
import { getModulePageConfig } from '../modules/module-config'
import { communitySectionLabel } from '../../i18n/community-sidebar-labels'
import type { CommunitySidebarSection } from './community-sidebar-types'
import { AdminModerationPanel } from './AdminModerationPanel'
import { CommunityModerationCategoryNav } from './CommunityModerationCategoryNav'
import { CommunityModerationCategoryProvider } from './community-moderation-category-context'
import { useCommunityHubConnection } from './useCommunityHubConnection'
import { useCommunityHubOfflineStatus } from './useCommunityHubOfflineStatus'
import { CommunityListSortProvider, useCommunityListSortContext } from './CommunityListSortContext'
import { CommunityListSortToolbar } from './CommunityListSortToolbar'
import { CommunityPlaceholderPanel } from './CommunityPlaceholderPanel'
import { KnowledgeMarketPanel } from './KnowledgeMarketPanel'
import { McpMarketPanel } from './McpMarketPanel'
import { MessageBoardPanel } from './MessageBoardPanel'
import { NewsCenterPanel } from './NewsCenterPanel'
import { RecommendPanel } from './RecommendPanel'
import { SkillsMarketPanel } from './SkillsMarketPanel'
import { WorkflowMarketPanel } from './WorkflowMarketPanel'
import { TaskMarketPanel } from './TaskMarketPanel'
import { UserCenterPanel } from './UserCenterPanel'
import { CommunitySettingsModal } from './CommunitySettingsModal'
import { useCommunityPresence } from './useCommunityPresence'
import { isCommunitySessionActive } from '../user/community-session'

const DEFAULT_COMMUNITY_ACTION = 'news'

const SORTABLE_ACTIONS = new Set([
  'news',
  'messages',
  'knowledge',
  'mcp',
  'skills',
  'workflow',
  'tasks',
])

const PANEL_ICONS: Record<string, ReactNode> = {
  subscribe: <IconSubscribe size={28} />,
  workflow: <IconWorkflow size={28} />,
  skills: <IconSkill size={28} />,
  mcp: <IconMcp size={28} />,
  knowledge: <IconKnowledge size={28} />,
  tasks: <IconTaskList size={28} />,
  news: <IconNews size={28} />,
  messages: <IconMessageBoard size={28} />,
  recommend: <IconRecommend size={28} />,
  management: <IconFlag size={28} />,
}

interface Props {
  activeAction?: string
  sidebarSection?: CommunitySidebarSection
}

function CommunityPageHeaderEnd({
  showSort,
  onOpenSettings,
}: {
  showSort: boolean
  onOpenSettings: () => void
}) {
  const { t } = useI18n()
  const sort = useCommunityListSortContext()

  return (
    <>
      {showSort ? (
        <CommunityListSortToolbar
          sortField={sort.sortField}
          sortAscending={sort.sortAscending}
          onSortFieldChange={sort.handleSortFieldChange}
        />
      ) : null}
      <CommunityModerationCategoryNav />
      <button
        type="button"
        className="tm-chat-header-settings-btn"
        title={t('communityPage.settings')}
        aria-label={t('communityPage.settings')}
        onClick={onOpenSettings}
      >
        <IconSliders size={16} />
      </button>
    </>
  )
}

function CommunityPageStatusRegistrar() {
  const { status: hubStatus } = useCommunityHubConnection()
  useCommunityHubOfflineStatus(hubStatus)
  return null
}

function CommunityPageStatusArea({ children }: { children: ReactNode }) {
  return (
    <ModulePageStatusProvider>
      <CommunityPageStatusRegistrar />
      {children}
      <ModulePageStatusBar />
    </ModulePageStatusProvider>
  )
}

export function CommunityPage({
  activeAction = DEFAULT_COMMUNITY_ACTION,
  sidebarSection = 'news',
}: Props) {
  const { t } = useI18n()
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  useCommunityPresence(isCommunitySessionActive())
  const config = getModulePageConfig('community', t)

  const effectiveAction = activeAction
  const panel = useMemo(() => {
    const icon = PANEL_ICONS[effectiveAction]
    if (!icon) return undefined
    return {
      title: t(`communityPage.panels.${effectiveAction}.title`),
      hint: t(`communityPage.panels.${effectiveAction}.subtitle`),
      icon,
    }
  }, [effectiveAction, t])
  const sectionLabel = communitySectionLabel(sidebarSection, t)
  const panelTitle = panel?.title
  const showSort = SORTABLE_ACTIONS.has(effectiveAction)

  const pageContent = (
      <main className="tm-main">
        <header className="tm-chat-header">
          <div className="tm-chat-breadcrumb">
            <span className="tm-model-pill tm-module-pill">{config.title}</span>
            <span className="tm-module-breadcrumb-group">
              <span className="tm-chat-breadcrumb-sep">/</span>
              <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
                {sectionLabel}
              </span>
            </span>
            {panelTitle && panelTitle !== sectionLabel ? (
              <span className="tm-module-breadcrumb-group">
                <span className="tm-chat-breadcrumb-sep">/</span>
                <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
                  {panelTitle}
                </span>
              </span>
            ) : null}
          </div>

          <div className="tm-chat-header-end">
            <CommunityPageHeaderEnd
              showSort={showSort}
              onOpenSettings={() => setShowSettingsModal(true)}
            />
          </div>
        </header>

        <CommunityPageStatusArea>
          <div className="tm-module-content">
        {effectiveAction === 'recommend' ? (
          <RecommendPanel />
        ) : effectiveAction === 'mcp' ? (
          <McpMarketPanel />
        ) : effectiveAction === 'news' ? (
          <NewsCenterPanel />
        ) : effectiveAction === 'messages' ? (
          <MessageBoardPanel />
        ) : effectiveAction === 'skills' ? (
          <SkillsMarketPanel />
        ) : effectiveAction === 'workflow' ? (
          <WorkflowMarketPanel />
        ) : effectiveAction === 'tasks' ? (
          <TaskMarketPanel />
        ) : effectiveAction === 'knowledge' ? (
          <KnowledgeMarketPanel />
        ) : effectiveAction === 'subscribe' ? (
          <UserCenterPanel />
        ) : effectiveAction === 'management' ? (
          <AdminModerationPanel />
        ) : panel ? (
          <CommunityPlaceholderPanel title={panel.title} hint={panel.hint} icon={panel.icon} />
        ) : (
          <div className="tm-module-empty">
            <h2 className="tm-module-empty-title">{config.contentEmptyTitle}</h2>
            <p className="tm-module-empty-hint">{config.contentEmptyHint}</p>
          </div>
        )}
          </div>
        </CommunityPageStatusArea>
      </main>
  )

  return (
    <ErrorBoundary title={t('errors.community')}>
    <CommunityListSortProvider>
      {effectiveAction === 'management' ? (
        <CommunityModerationCategoryProvider>{pageContent}</CommunityModerationCategoryProvider>
      ) : (
        pageContent
      )}
      {showSettingsModal ? (
        <CommunitySettingsModal onClose={() => setShowSettingsModal(false)} />
      ) : null}
    </CommunityListSortProvider>
    </ErrorBoundary>
  )
}
