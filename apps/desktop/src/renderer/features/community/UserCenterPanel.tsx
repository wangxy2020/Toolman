import { useMemo, useState, type ReactNode } from 'react'

import { type CommunityResourceType } from '@toolman/shared'

import { CommunityPanelHeader, CommunityPanelRefreshButton } from './CommunityPanelHeader'
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS } from './community-task-utils'
import { INSTALL_STATUS_LABELS, USER_ROLE_LABELS } from './community-user-utils'
import {
  groupUserCenterResources,
  useCommunityUserCenter,
  type UserCenterSection,
} from './useCommunityUserCenter'

const SECTIONS: Array<{ key: UserCenterSection; label: string }> = [
  { key: 'publishes', label: '发布' },
  { key: 'messages', label: '我的留言' },
  { key: 'installs', label: '安装' },
  { key: 'likes', label: '点赞' },
  { key: 'favorites', label: '收藏' },
  { key: 'tasks', label: '任务' },
]

const USER_CENTER_RESOURCE_LABELS: Record<CommunityResourceType, string> = {
  knowledge: '知识库',
  mcp: 'MCP',
  skill: 'Skills',
  workflow: '工作流',
  task: '任务',
}

type FeedStat = {
  kind: 'like' | 'favorite' | 'reply'
  label: string
  accent?: boolean
}

function formatUserCenterDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getSectionCount(
  section: UserCenterSection,
  center: ReturnType<typeof useCommunityUserCenter>,
): number {
  switch (section) {
    case 'publishes':
      return center.publishes.length
    case 'messages':
      return center.messages.length
    case 'installs':
      return center.installs.length
    case 'likes':
      return center.likeCount
    case 'favorites':
      return center.favoriteCount
    case 'tasks':
      return center.tasks.published.length + center.tasks.assigned.length
  }
}

function FeedStatIcon({ kind }: { kind: FeedStat['kind'] }) {
  if (kind === 'like') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M14 10h4.757a2 2 0 011.708 2.89l-3.514 6A2 2 0 0115.243 20H7a2 2 0 01-2-2v-8a2 2 0 01.586-1.414l6.586-6.586a2 2 0 012.828 0L15 4.5V10z"
        />
      </svg>
    )
  }
  if (kind === 'favorite') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  )
}

function UserCenterFeedCard({
  tag,
  date,
  title,
  description,
  stats,
}: {
  tag: string
  date: string
  title: string
  description?: string | null
  stats?: FeedStat[]
}) {
  return (
    <article className="tm-user-center-feed-card">
      <div className="tm-user-center-feed-card-top">
        <span className="tm-user-center-feed-tag">
          <span className="tm-user-center-feed-tag-dot" aria-hidden="true" />
          {tag}
        </span>
        <span className="tm-user-center-feed-date">{date}</span>
      </div>
      <h4 className="tm-user-center-feed-title">{title}</h4>
      {description ? <p className="tm-user-center-feed-desc">{description}</p> : null}
      {stats && stats.length > 0 ? (
        <div className="tm-user-center-feed-stats">
          {stats.map((stat) => (
            <span
              key={`${stat.kind}-${stat.label}`}
              className={[
                'tm-user-center-feed-stat',
                stat.accent ? 'tm-user-center-feed-stat--accent' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <FeedStatIcon kind={stat.kind} />
              {stat.label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function UserCenterFeedGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tm-user-center-feed-group">
      <h3 className="tm-user-center-feed-group-label">{label}</h3>
      <div className="tm-user-center-feed-list">{children}</div>
    </section>
  )
}

export function UserCenterPanel() {
  const [section, setSection] = useState<UserCenterSection>('publishes')
  const center = useCommunityUserCenter()
  const profile = center.profile
  const activeCount = useMemo(() => getSectionCount(section, center), [section, center])

  const renderSectionContent = () => {
    if (center.profileLoading || center.loading) {
      return <div className="tm-user-center-empty">加载个人数据中…</div>
    }
    if (!profile) {
      return <div className="tm-user-center-empty">请先登录或注册</div>
    }

    if (section === 'publishes') {
      if (center.publishes.length === 0) {
        return <div className="tm-user-center-empty">暂无发布资源</div>
      }
      return (
        <div className="tm-user-center-feed-list">
          {center.publishes.map((item) => (
            <UserCenterFeedCard
              key={item.id}
              tag={item.resourceType}
              date={formatUserCenterDateTime(item.updatedAt)}
              title={item.title}
              description={item.description}
              stats={[
                { kind: 'like', label: `${item.likeCount} 赞` },
                { kind: 'favorite', label: `v${item.version}` },
              ]}
            />
          ))}
        </div>
      )
    }

    if (section === 'messages') {
      if (center.messages.length === 0) {
        return <div className="tm-user-center-empty">暂无留言</div>
      }
      return (
        <div className="tm-user-center-feed-list">
          {center.messages.map((item) => (
            <UserCenterFeedCard
              key={item.id}
              tag="留言"
              date={formatUserCenterDateTime(item.createdAt)}
              title={item.body}
              stats={[
                { kind: 'like', label: `${item.likeCount} 赞` },
                { kind: 'favorite', label: `${item.favoriteCount} 收藏` },
                {
                  kind: 'reply',
                  label: `${item.replyCount} 回复`,
                  accent: item.replyCount > 0,
                },
              ]}
            />
          ))}
        </div>
      )
    }

    if (section === 'installs') {
      if (center.installs.length === 0) {
        return <div className="tm-user-center-empty">暂无安装记录</div>
      }
      return (
        <div className="tm-user-center-feed-list">
          {center.installs.map((item) => (
            <UserCenterFeedCard
              key={item.id}
              tag={INSTALL_STATUS_LABELS[item.installStatus]}
              date={formatUserCenterDateTime(item.installedAt)}
              title={`资源 ${item.resourceId}`}
              description={item.errorMessage ?? item.localRef}
            />
          ))}
        </div>
      )
    }

    if (section === 'likes') {
      if (center.likeCount === 0) {
        return <div className="tm-user-center-empty">暂无点赞内容</div>
      }
      const likedResourceGroups = groupUserCenterResources(center.likes.resources)
      return (
        <div className="tm-user-center-feed-groups">
          {center.likes.news.length > 0 ? (
            <UserCenterFeedGroup label="资讯">
              {center.likes.news.map((item) => (
                <UserCenterFeedCard
                  key={`news-${item.id}`}
                  tag="资讯"
                  date={formatUserCenterDateTime(item.publishedAt)}
                  title={item.title}
                  description={item.summary}
                  stats={[{ kind: 'like', label: `${item.likeCount} 赞` }]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {center.likes.messages.length > 0 ? (
            <UserCenterFeedGroup label="留言">
              {center.likes.messages.map((item) => (
                <UserCenterFeedCard
                  key={`message-${item.id}`}
                  tag="留言"
                  date={formatUserCenterDateTime(item.createdAt)}
                  title={item.body}
                  stats={[
                    { kind: 'like', label: `${item.likeCount} 赞` },
                    { kind: 'reply', label: item.author.displayName },
                  ]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {Object.entries(likedResourceGroups).map(([resourceType, items]) => (
            <UserCenterFeedGroup
              key={`likes-${resourceType}`}
              label={USER_CENTER_RESOURCE_LABELS[resourceType as CommunityResourceType]}
            >
              {items.map((item) => (
                <UserCenterFeedCard
                  key={`resource-${item.id}`}
                  tag={USER_CENTER_RESOURCE_LABELS[item.resourceType]}
                  date={formatUserCenterDateTime(item.updatedAt)}
                  title={item.title}
                  description={item.description}
                  stats={[{ kind: 'like', label: `${item.likeCount} 赞` }]}
                />
              ))}
            </UserCenterFeedGroup>
          ))}
        </div>
      )
    }

    if (section === 'favorites') {
      if (center.favoriteCount === 0) {
        return <div className="tm-user-center-empty">暂无收藏内容</div>
      }
      const favoriteResourceGroups = groupUserCenterResources(center.favorites.resources)
      return (
        <div className="tm-user-center-feed-groups">
          {center.favorites.news.length > 0 ? (
            <UserCenterFeedGroup label="资讯">
              {center.favorites.news.map((item) => (
                <UserCenterFeedCard
                  key={`news-${item.id}`}
                  tag="资讯"
                  date={formatUserCenterDateTime(item.publishedAt)}
                  title={item.title}
                  description={item.summary}
                  stats={[{ kind: 'favorite', label: `${item.favoriteCount} 收藏` }]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {center.favorites.messages.length > 0 ? (
            <UserCenterFeedGroup label="留言">
              {center.favorites.messages.map((item) => (
                <UserCenterFeedCard
                  key={`message-${item.id}`}
                  tag="留言"
                  date={formatUserCenterDateTime(item.createdAt)}
                  title={item.body}
                  stats={[{ kind: 'favorite', label: `${item.favoriteCount} 收藏` }]}
                />
              ))}
            </UserCenterFeedGroup>
          ) : null}
          {Object.entries(favoriteResourceGroups).map(([resourceType, items]) => (
            <UserCenterFeedGroup
              key={`favorites-${resourceType}`}
              label={USER_CENTER_RESOURCE_LABELS[resourceType as CommunityResourceType]}
            >
              {items.map((item) => (
                <UserCenterFeedCard
                  key={`resource-${item.id}`}
                  tag={USER_CENTER_RESOURCE_LABELS[item.resourceType]}
                  date={formatUserCenterDateTime(item.updatedAt)}
                  title={item.title}
                  description={item.description}
                  stats={[{ kind: 'favorite', label: `${item.favoriteCount} 收藏` }]}
                />
              ))}
            </UserCenterFeedGroup>
          ))}
        </div>
      )
    }

    if (center.tasks.published.length === 0 && center.tasks.assigned.length === 0) {
      return <div className="tm-user-center-empty">暂无相关任务</div>
    }

    return (
      <div className="tm-user-center-feed-groups">
        {center.tasks.published.length > 0 ? (
          <UserCenterFeedGroup label="我发布的">
            {center.tasks.published.map((task) => (
              <UserCenterFeedCard
                key={task.id}
                tag={TASK_TYPE_LABELS[task.taskType]}
                date={formatUserCenterDateTime(task.updatedAt)}
                title={task.title}
                stats={[{ kind: 'reply', label: TASK_STATUS_LABELS[task.status] }]}
              />
            ))}
          </UserCenterFeedGroup>
        ) : null}
        {center.tasks.assigned.length > 0 ? (
          <UserCenterFeedGroup label="我接单的">
            {center.tasks.assigned.map((task) => (
              <UserCenterFeedCard
                key={task.id}
                tag={TASK_STATUS_LABELS[task.status]}
                date={formatUserCenterDateTime(task.updatedAt)}
                title={task.title}
                stats={[{ kind: 'reply', label: task.publisher.displayName }]}
              />
            ))}
          </UserCenterFeedGroup>
        ) : null}
      </div>
    )
  }

  return (
    <div className="tm-community-market tm-community-user-center">
      {center.profileError ? <div className="tm-error-bar">{center.profileError}</div> : null}
      {center.error ? <div className="tm-error-bar">{center.error}</div> : null}

      <div className="tm-user-center-overview">
        <CommunityPanelHeader
          title="我的"
          subtitle={
            profile
              ? profile.displayName
              : '查看我的发布、安装、收藏与任务'
          }
          titleExtra={
            profile ? (
              <span className="tm-user-center-role-badge">{USER_ROLE_LABELS[profile.role]}</span>
            ) : null
          }
          actions={
            <CommunityPanelRefreshButton
              loading={center.loading}
              disabled={center.loading}
              onClick={() => void center.load()}
            />
          }
        />

        <div
          className="tm-user-center-stat-grid"
          style={{ ['--tm-stat-cols' as string]: SECTIONS.length }}
          role="tablist"
          aria-label="我的数据分区"
        >
          {SECTIONS.map((item) => {
            const count = getSectionCount(item.key, center)
            const active = section === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  'tm-user-center-stat-card',
                  active ? 'tm-user-center-stat-card--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSection(item.key)}
              >
                <span className="tm-user-center-stat-label">{item.label}</span>
                <span className="tm-user-center-stat-value">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {profile?.bio ? <p className="tm-user-center-bio">{profile.bio}</p> : null}

      <div className="tm-user-center-feed">
        <div className="tm-user-center-feed-meta">
          {profile ? (
            <>
              <span>当前列表共 {activeCount} 条记录</span>
              <span>按最新时间排序</span>
            </>
          ) : (
            <span>登录后查看个人数据</span>
          )}
        </div>
        <div className="tm-user-center-feed-body">{renderSectionContent()}</div>
      </div>
    </div>
  )
}
