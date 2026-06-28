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
import { canDeleteCommunityResource } from './community-user-utils'
import { deleteCommunityResource, listCommunityResources } from './community-api.client'
import { invalidateCommunityListCache } from './community-list-cache'
import { isResourceRejectedLike } from './community-user-center-status'
import { notifyCommunityUserDataChanged } from './community-events'
import { isUiMockCommunityId } from './community-ui-mock'
import { useCommunityListSortContext } from './CommunityListSortContext'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useCommunityHubConnection } from './useCommunityHubConnection'
import { useCommunityResources } from './useCommunityResources'
import { useCommunityUser } from './useCommunityUser'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { useCommunityPanelStatus } from './community-panel-status'
import { useRegisterModulePanelStatus } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'
import { getCommunityResourceTypeLabel } from '../../i18n/community-status-labels'

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

const RESOURCE_LIST_QUERY = { sort: 'installs' as const }

export function CommunityResourceMarketPanel({
  resourceType,
  title,
  subtitle,
  publishLabel,
  emptyHint,
}: CommunityResourceMarketPanelProps) {
  const { t } = useI18n()
  const resolvedEmptyHint = emptyHint ?? t('communityPage.market.defaultEmpty')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPublish, setShowPublish] = useState(false)
  const [resumePublish, setResumePublish] = useState<CommunityResourceItem | null>(null)
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
      invalidateCommunityListCache('resources:')
      await market.load({ force: true })
      notifyCommunityUserDataChanged()
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : t('communityPage.market.deleteResourceFailed')
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
        onRefresh={() => {
          invalidateCommunityListCache('resources:')
          void market.load({ force: true })
        }}
        onPublish={() => {
          if (!requireRegistration('community_write')) return
          void (async () => {
            setPublishNotice(null)
            const profile = user.profile
            if (!profile?.id) {
              setResumePublish(null)
              setShowPublish(true)
              return
            }
            try {
              const mine = await listCommunityResources({
                resourceType,
                authorId: profile.id,
                limit: 50,
              })
              const pending = mine.items.find((item) => item.status === 'pending_review')
              if (pending) {
                setPublishNotice(
                  t('communityPage.market.pendingResourceReview', { title: pending.title }),
                )
                return
              }
              const draft = mine.items.find((item) => item.status === 'draft')
              const rejected = mine.items.find((item) => isResourceRejectedLike(item))
              setResumePublish(rejected ?? draft ?? null)
              setShowPublish(true)
            } catch {
              setResumePublish(null)
              setShowPublish(true)
            }
          })()
        }}
        publishDisabled={publishDisabled}
        isEmpty={sortedItems.length === 0}
        emptyHint={resolvedEmptyHint}
      >
        <ul className="tm-kb-file-list">
          {sortedItems.map((item) => {
            const canDelete = canDeleteCommunityResource(item.author.id, user.profile)
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
                onDelete={canDelete ? () => setResourceToDelete(item) : undefined}
                onLike={() => void runInteraction(item.id, 'like', () => market.like(item.id))}
                onDislike={() =>
                  void runInteraction(item.id, 'dislike', () => market.dislike(item.id))
                }
                onFavorite={() =>
                  void runInteraction(item.id, 'favorite', () => market.favorite(item.id))
                }
                onShare={() =>
                  void copyCommunityShareText(
                    t('communityPage.market.shareResource', {
                      title: item.title,
                      type: getCommunityResourceTypeLabel(resourceType, t),
                      version: item.version,
                    }),
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
          resourceLabel={getCommunityResourceTypeLabel(resourceType, t)}
          resumeResource={resumePublish}
          onClose={() => {
            setShowPublish(false)
            setResumePublish(null)
          }}
          onPublished={(message) => {
            setPublishNotice(message)
            setResumePublish(null)
            setShowPublish(false)
            market.setError(null)
            void market.load()
            notifyCommunityUserDataChanged()
          }}
        />
      ) : null}

      {resourceToDelete ? (
        <ConfirmDialog
          title={t('communityPage.market.deleteResourceTitle')}
          message={t('communityPage.market.deleteResourceMessage', {
            title: resourceToDelete.title,
          })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setResourceToDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
      {modal}
    </>
  )
}
