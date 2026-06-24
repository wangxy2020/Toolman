import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { type CommunityResourceItem, type CommunityResourceType } from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconKnowledge, IconMcp, IconSkill, IconWorkflow } from '../../components/icons'
import {
  formatCommunityDate,
} from './community-market-utils'
import { buildResourceCommentTarget } from './community-comment-utils'
import { sortCommunityListItems } from './community-list-sort'
import { CommunityCommentListItemShell } from './CommunityCommentListItemShell'
import { CommunityListFileCard } from './CommunityListFileCard'
import { CommunityFederationSourceBadge } from './CommunityFederationSourceBadge'
import { CommunityListPanelShell } from './CommunityListPanelShell'
import { CommunityResourcePublishModal } from './CommunityResourcePublishModal'
import { copyCommunityShareText } from './community-share-utils'
import { deleteCommunityResource } from './community-api.client'
import { isUiMockCommunityId } from './community-ui-mock'
import { useCommunityListSortContext } from './CommunityListSortContext'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useCommunityHubConnection } from './useCommunityHubConnection'
import { useCommunityResources } from './useCommunityResources'
import { useCommunityUser } from './useCommunityUser'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { useCommunityPanelStatus } from './community-panel-status'
import { useRegisterModulePanelStatus } from '../../components/module-page-status'

export interface CommunityResourceMarketPanelProps {
  resourceType: CommunityResourceType
  title: string
  subtitle: string
  publishLabel: string
  emptyHint?: string
}

const RESOURCE_ICONS: Partial<Record<CommunityResourceType, ReactNode>> = {
  mcp: <IconMcp size={18} />,
  skill: <IconSkill size={18} />,
  workflow: <IconWorkflow size={18} />,
  knowledge: <IconKnowledge size={18} />,
}

const RESOURCE_LABELS: Record<CommunityResourceType, string> = {
  mcp: 'MCP',
  skill: 'Skills',
  workflow: '工作流',
  task: '任务',
  knowledge: '知识库',
}

const RESOURCE_LIST_QUERY = { sort: 'installs' as const }

export function CommunityResourceMarketPanel({
  resourceType,
  title,
  subtitle,
  publishLabel,
  emptyHint = '暂无可用资源',
}: CommunityResourceMarketPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPublish, setShowPublish] = useState(false)
  const [publishNotice, setPublishNotice] = useState<string | null>(null)
  const [resourceToDelete, setResourceToDelete] = useState<CommunityResourceItem | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<
    'like' | 'dislike' | 'favorite' | 'install' | 'delete' | null
  >(null)
  const { sortField, sortAscending } = useCommunityListSortContext()
  const comments = useCommunityCommentExpansion()

  const market = useCommunityResources({
    resourceType,
    query: RESOURCE_LIST_QUERY,
    autoLoadDetail: false,
  })
  const { status: hubStatus } = useCommunityHubConnection()
  const user = useCommunityUser()
  const { requireRegistration, modal } = useRegistrationGate()

  const hubWriteBlocked = hubStatus?.offlineReadOnly === true
  const publishDisabled = hubWriteBlocked || user.profile?.canPublish === false

  useCommunityPanelStatus(`community-market-${resourceType}`, {
    loading: market.loading,
    error: market.error,
    onClearError: () => market.setError(null),
  })
  useCommunityPanelStatus(`community-market-${resourceType}-user`, {
    error: user.error,
  })
  useRegisterModulePanelStatus(
    `community-market-${resourceType}-publish`,
    publishNotice
      ? {
          tone: 'info',
          message: publishNotice,
          onDismiss: () => setPublishNotice(null),
        }
      : null,
    () => setPublishNotice(null),
  )

  useEffect(() => {
    setSelectedId(null)
  }, [resourceType])

  const sortedItems = useMemo(
    () =>
      sortCommunityListItems(
        market.items.map((item) => ({
          ...item,
          title: item.title,
          createdAt: item.createdAt,
          sizeBytes: item.resourceSize,
        })),
        sortField,
        sortAscending,
      ),
    [market.items, sortAscending, sortField],
  )

  const handleInstall = async (resourceId: string, version: string) => {
    setBusyItemId(resourceId)
    setBusyAction('install')
    try {
      await market.install({ resourceType, resourceId, version })
    } finally {
      setBusyItemId(null)
      setBusyAction(null)
    }
  }

  const runInteraction = async (
    resourceId: string,
    action: 'like' | 'dislike' | 'favorite',
    runner: () => Promise<unknown>,
  ) => {
    setBusyItemId(resourceId)
    setBusyAction(action)
    try {
      await runner()
    } finally {
      setBusyItemId(null)
      setBusyAction(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!resourceToDelete) return

    const resourceId = resourceToDelete.id
    setBusyItemId(resourceId)
    setBusyAction('delete')
    try {
      if (!isUiMockCommunityId(resourceId)) {
        await deleteCommunityResource(resourceId)
      }
      setResourceToDelete(null)
      if (selectedId === resourceId) setSelectedId(null)
      await market.load()
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '删除资源失败'
      market.setError(message)
    } finally {
      setBusyItemId(null)
      setBusyAction(null)
    }
  }

  return (
    <>
      <CommunityListPanelShell
        title={title}
        subtitle={subtitle}
        publishLabel={publishLabel}
        loading={market.loading}
        onRefresh={() => void market.load()}
        onPublish={() => {
          if (!requireRegistration('community_write')) return
          setShowPublish(true)
        }}
        publishDisabled={publishDisabled}
        isEmpty={sortedItems.length === 0}
        emptyHint={emptyHint}
      >
        <ul className="tm-kb-file-list">
          {sortedItems.map((item) => {
            const isOwner = user.profile?.id === item.author.id
            const commentTarget = buildResourceCommentTarget(item.id)
            const icon = RESOURCE_ICONS[resourceType]

            return (
              <CommunityCommentListItemShell
                key={item.id}
                commentTarget={commentTarget}
                comments={comments}
                fallbackCommentCount={item.commentCount ?? 0}
                counts={{
                  likeCount: item.likeCount,
                  dislikeCount: item.dislikeCount,
                  favoriteCount: item.favoriteCount,
                  installCount: item.installCount,
                }}
                state={{
                  liked: item.likedByMe,
                  disliked: item.dislikedByMe,
                  favorited: item.favoritedByMe,
                }}
                showInstall={resourceType !== 'task'}
                busyAction={busyItemId === item.id ? busyAction : null}
                reportTarget={{ targetType: 'resource', targetId: item.id }}
                onDelete={isOwner ? () => setResourceToDelete(item) : undefined}
                onLike={() => void runInteraction(item.id, 'like', () => market.like(item.id))}
                onDislike={() =>
                  void runInteraction(item.id, 'dislike', () => market.dislike(item.id))
                }
                onFavorite={() =>
                  void runInteraction(item.id, 'favorite', () => market.favorite(item.id))
                }
                onShare={() =>
                  void copyCommunityShareText(
                    `${item.title}\n类型：${RESOURCE_LABELS[resourceType]}\n版本：${item.version}`,
                  )
                }
                onInstall={
                  resourceType === 'task'
                    ? undefined
                    : () => void handleInstall(item.id, item.version)
                }
              >
                <CommunityListFileCard
                  title={item.title}
                  titleExtra={<CommunityFederationSourceBadge source={item.federationSource} />}
                  meta={
                    <>
                      <span>v{item.version}</span>
                      <span>·</span>
                      <span>{item.author.displayName}</span>
                      <span>·</span>
                      <span>{formatCommunityDate(item.updatedAt)}</span>
                    </>
                  }
                  description={item.description || undefined}
                  selected={selectedId === item.id}
                  onClick={() => setSelectedId((current) => (current === item.id ? null : item.id))}
                  icon={icon}
                />
              </CommunityCommentListItemShell>
            )
          })}
        </ul>
      </CommunityListPanelShell>

      {showPublish ? (
        <CommunityResourcePublishModal
          resourceType={resourceType}
          resourceLabel={RESOURCE_LABELS[resourceType]}
          onClose={() => setShowPublish(false)}
          onPublished={(message) => {
            setPublishNotice(message)
            market.setError(null)
            void market.load()
          }}
        />
      ) : null}

      {resourceToDelete ? (
        <ConfirmDialog
          title="删除资源"
          message={`确定删除「${resourceToDelete.title}」吗？删除后将从市场下架。`}
          confirmLabel="删除"
          danger
          onCancel={() => setResourceToDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
      {modal}
    </>
  )
}
