import { useState, useMemo, type ReactNode } from 'react'

import { IconSliders } from '../../components/icons'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
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
import { CommunityHubOfflineBanner } from './CommunityHubOfflineBanner'
import { KnowledgeMarketPanel } from './KnowledgeMarketPanel'
import { McpMarketPanel } from './McpMarketPanel'
import { MessageBoardPanel } from './MessageBoardPanel'
import { NewsCenterPanel } from './NewsCenterPanel'
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

const PANEL_TITLE_ACTIONS = new Set([
  'subscribe',
  'workflow',
  'skills',
  'mcp',
  'knowledge',
  'tasks',
  'news',
  'messages',
  'management',
])

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
      <HeaderIconButton label={t('communityPage.settings')} onClick={onOpenSettings}>
        <IconSliders size={16} />
      </HeaderIconButton>
    </>
  )
}

function CommunityPageStatusRegistrar() {
  const { status: hubStatus } = useCommunityHubConnection()
  useCommunityHubOfflineStatus(hubStatus)
  return <CommunityHubOfflineBanner status={hubStatus} />
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
  const panelTitle = useMemo(() => {
    if (!PANEL_TITLE_ACTIONS.has(effectiveAction)) return undefined
    return t(`communityPage.panels.${effectiveAction}.title`)
  }, [effectiveAction, t])
  const sectionLabel = communitySectionLabel(sidebarSection, t)
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
          <div className="tm-module-content tm-community-module-content">
            <div hidden={effectiveAction !== 'mcp'} aria-hidden={effectiveAction !== 'mcp'}>
              <McpMarketPanel />
            </div>
            <div hidden={effectiveAction !== 'news'} aria-hidden={effectiveAction !== 'news'}>
              <NewsCenterPanel />
            </div>
            <div hidden={effectiveAction !== 'messages'} aria-hidden={effectiveAction !== 'messages'}>
              <MessageBoardPanel />
            </div>
            <div hidden={effectiveAction !== 'skills'} aria-hidden={effectiveAction !== 'skills'}>
              <SkillsMarketPanel />
            </div>
            <div hidden={effectiveAction !== 'workflow'} aria-hidden={effectiveAction !== 'workflow'}>
              <WorkflowMarketPanel />
            </div>
            <div hidden={effectiveAction !== 'tasks'} aria-hidden={effectiveAction !== 'tasks'}>
              <TaskMarketPanel />
            </div>
            <div hidden={effectiveAction !== 'knowledge'} aria-hidden={effectiveAction !== 'knowledge'}>
              <KnowledgeMarketPanel />
            </div>
            <div hidden={effectiveAction !== 'subscribe'} aria-hidden={effectiveAction !== 'subscribe'}>
              <UserCenterPanel />
            </div>
            {effectiveAction === 'management' ? <AdminModerationPanel /> : null}
            {PANEL_TITLE_ACTIONS.has(effectiveAction) ? null : (
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
