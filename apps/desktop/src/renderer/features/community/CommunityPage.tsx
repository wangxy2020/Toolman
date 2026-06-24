import { useState, type ReactNode } from 'react'

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
import { ModulePageStatusBar } from '../../components/ModulePageStatusBar'
import { ModulePageStatusProvider } from '../../components/module-page-status'
import { getModulePageConfig } from '../modules/module-config'
import { communitySectionLabel, type CommunitySidebarSection } from './community-sidebar-types'
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

const PANEL_CONFIG: Record<
  string,
  { title: string; hint: string; icon: React.ReactNode }
> = {
  subscribe: {
    title: '我的',
    hint: '查看我的发布、安装记录、收藏与任务。',
    icon: <IconSubscribe size={28} />,
  },
  workflow: {
    title: '工作流市场',
    hint: '浏览与安装社区共享的自动化工作流。',
    icon: <IconWorkflow size={28} />,
  },
  skills: {
    title: 'Skills市场',
    hint: '发现与安装社区贡献的 Agent Skills。',
    icon: <IconSkill size={28} />,
  },
  mcp: {
    title: 'MCP市场',
    hint: '探索社区推荐的 MCP 服务器与工具集成。',
    icon: <IconMcp size={28} />,
  },
  knowledge: {
    title: '知识库市场',
    hint: '浏览社区公开的知识库与文档合集。',
    icon: <IconKnowledge size={28} />,
  },
  tasks: {
    title: '任务市场',
    hint: '浏览与承接社区任务。',
    icon: <IconTaskList size={28} />,
  },
  news: {
    title: '资讯',
    hint: '查看社区动态、更新公告与活动资讯。',
    icon: <IconNews size={28} />,
  },
  messages: {
    title: '留言板',
    hint: '浏览社区留言与互动讨论。',
    icon: <IconMessageBoard size={28} />,
  },
  recommend: {
    title: '推荐',
    hint: '根据你的使用习惯，为你推荐智能体与资源。',
    icon: <IconRecommend size={28} />,
  },
  management: {
    title: '社区管理',
    hint: '扫描在线资源、处理举报、任命管理员并封禁恶意用户。',
    icon: <IconFlag size={28} />,
  },
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
        title="社区设置"
        aria-label="社区设置"
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
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  useCommunityPresence(isCommunitySessionActive())
  const config = getModulePageConfig('community')

  const effectiveAction = activeAction
  const panel = PANEL_CONFIG[effectiveAction]
  const sectionLabel = communitySectionLabel(sidebarSection)
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
  )
}
