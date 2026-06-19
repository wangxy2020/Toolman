import { useState } from 'react'
import type { P2pWorkspace } from '@toolman/shared'
import { IconChevronRight, IconFolder, IconPlus } from '../../components/icons'

interface Props {
  myGroups: P2pWorkspace[]
  joinedGroups: P2pWorkspace[]
  activeId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onJoin: () => void
}

function isGroupInList(groups: P2pWorkspace[], activeId: string | null) {
  return activeId != null && groups.some((group) => group.id === activeId)
}

export function GroupSidebar({
  myGroups,
  joinedGroups,
  activeId,
  loading,
  onSelect,
  onCreate,
  onJoin,
}: Props) {
  const [myGroupsOpen, setMyGroupsOpen] = useState(true)
  const [joinedGroupsOpen, setJoinedGroupsOpen] = useState(true)
  const isMyGroupsActive = isGroupInList(myGroups, activeId)
  const isJoinedGroupsActive = isGroupInList(joinedGroups, activeId)

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onCreate}>
          <IconPlus />
          创建群组
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
                title={myGroupsOpen ? '收起' : '展开'}
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
                我的群组
              </button>
              <div className="tm-assistant-actions">
                <button
                  type="button"
                  className="tm-assistant-action-btn"
                  title="创建群组"
                  onClick={onCreate}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </div>

            {myGroupsOpen &&
              (loading && myGroups.length === 0 ? (
                <div className="tm-session-empty">加载中…</div>
              ) : myGroups.length === 0 ? (
                <div className="tm-session-empty">暂无群组，点击上方创建</div>
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
                    title={group.name}
                  >
                    <span className="tm-session-item-icon" aria-hidden="true">
                      <IconFolder size={14} />
                    </span>
                    <span className="tm-session-item-label">{group.name}</span>
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
                title={joinedGroupsOpen ? '收起' : '展开'}
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
                已加入群组
              </button>
              <div className="tm-assistant-actions">
                <button
                  type="button"
                  className="tm-assistant-action-btn"
                  title="加入群组"
                  onClick={onJoin}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </div>

            {joinedGroupsOpen &&
              (joinedGroups.length === 0 ? (
                <div className="tm-session-empty">暂未加入任何群组</div>
              ) : (
                joinedGroups.map((group) => (
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
                    title={group.name}
                  >
                    <span className="tm-session-item-icon" aria-hidden="true">
                      <IconFolder size={14} />
                    </span>
                    <span className="tm-session-item-label">{group.name}</span>
                  </button>
                ))
              ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
