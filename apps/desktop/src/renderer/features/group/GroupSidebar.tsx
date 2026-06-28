import { useState } from 'react'
import type { P2pWorkspace } from '@toolman/shared'
import { IconChevronRight, IconFolder, IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { translateGroupName } from '../../i18n/system-labels'

interface Props {
  myGroups: P2pWorkspace[]
  joinedGroups: P2pWorkspace[]
  pendingJoinCount?: number
  activeId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onJoin: () => void
  onShowPendingJoins?: () => void
}

function isGroupInList(groups: P2pWorkspace[], activeId: string | null) {
  return activeId != null && groups.some((group) => group.id === activeId)
}

export function GroupSidebar({
  myGroups,
  joinedGroups,
  pendingJoinCount = 0,
  activeId,
  loading,
  onSelect,
  onCreate,
  onJoin,
  onShowPendingJoins,
}: Props) {
  const { t } = useI18n()
  const [myGroupsOpen, setMyGroupsOpen] = useState(true)
  const [joinedGroupsOpen, setJoinedGroupsOpen] = useState(true)
  const isMyGroupsActive = isGroupInList(myGroups, activeId)
  const isJoinedGroupsActive = isGroupInList(joinedGroups, activeId)

  const formatGroupLabel = (name: string | null | undefined): string => {
    const trimmed = name?.trim()
    if (!trimmed) return t('sidebar.group.unnamed')
    return translateGroupName(trimmed, t)
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onCreate}>
          <IconPlus />
          {t('sidebar.group.create')}
        </button>

        <div className="tm-sidebar-list">
          <div className="tm-assistant-group">
            <div
              className={[
                'tm-assistant-row',
                myGroupsOpen ? 'tm-assistant-row--open' : '',
                isMyGroupsActive ? 'tm-assistant-row--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="tm-assistant-expand"
                title={myGroupsOpen ? t('common.collapse') : t('common.expand')}
                onClick={() => setMyGroupsOpen((v) => !v)}
              >
                <IconChevronRight open={myGroupsOpen} />
              </button>
              <button
                type="button"
                className={[
                  'tm-assistant-name',
                  isMyGroupsActive ? 'tm-assistant-name--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setMyGroupsOpen((v) => !v)}
              >
                {t('sidebar.group.myGroups')}
              </button>
            </div>

            {myGroupsOpen &&
              (loading && myGroups.length === 0 ? (
                <div className="tm-session-empty">{t('common.loading')}</div>
              ) : myGroups.length === 0 ? (
                <div className="tm-session-empty">{t('sidebar.group.emptyNoGroups')}</div>
              ) : (
                myGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={[
                      'tm-session-item',
                      'tm-session-item--with-icon',
                      activeId === group.id ? 'tm-session-item--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelect(group.id)}
                    title={formatGroupLabel(group.name)}
                  >
                    <span className="tm-session-item-icon" aria-hidden="true">
                      <IconFolder size={14} />
                    </span>
                    <span className="tm-session-item-label">{formatGroupLabel(group.name)}</span>
                  </button>
                ))
              ))}
          </div>

          <div className="tm-assistant-group">
            <div
              className={[
                'tm-assistant-row',
                joinedGroupsOpen ? 'tm-assistant-row--open' : '',
                isJoinedGroupsActive ? 'tm-assistant-row--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="tm-assistant-expand"
                title={joinedGroupsOpen ? t('common.collapse') : t('common.expand')}
                onClick={() => setJoinedGroupsOpen((v) => !v)}
              >
                <IconChevronRight open={joinedGroupsOpen} />
              </button>
              <button
                type="button"
                className={[
                  'tm-assistant-name',
                  isJoinedGroupsActive ? 'tm-assistant-name--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setJoinedGroupsOpen((v) => !v)}
              >
                {t('sidebar.group.joinedGroups')}
              </button>
              <div className="tm-assistant-actions">
                <button
                  type="button"
                  className="tm-assistant-action-btn"
                  title={t('sidebar.group.join')}
                  onClick={onJoin}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </div>

            {joinedGroupsOpen &&
              (loading && joinedGroups.length === 0 && pendingJoinCount === 0 ? (
                <div className="tm-session-empty">{t('common.loading')}</div>
              ) : joinedGroups.length === 0 && pendingJoinCount === 0 ? (
                <div className="tm-session-empty">{t('sidebar.group.emptyNoJoined')}</div>
              ) : (
                <>
                  {pendingJoinCount > 0 ? (
                    <button
                      type="button"
                      className="tm-session-item tm-session-item--with-icon tm-session-item--muted"
                      onClick={onShowPendingJoins}
                      title={t('sidebar.group.pendingJoins', { count: pendingJoinCount })}
                    >
                      <span className="tm-session-item-label">
                        {t('sidebar.group.pendingJoins', { count: pendingJoinCount })}
                      </span>
                    </button>
                  ) : null}
                  {joinedGroups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      className={[
                        'tm-session-item',
                        'tm-session-item--with-icon',
                        activeId === group.id ? 'tm-session-item--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onSelect(group.id)}
                      title={formatGroupLabel(group.name)}
                    >
                      <span className="tm-session-item-icon" aria-hidden="true">
                        <IconFolder size={14} />
                      </span>
                      <span className="tm-session-item-label">{formatGroupLabel(group.name)}</span>
                    </button>
                  ))}
                </>
              ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
