import { useState } from 'react'

import { IconRefresh } from '../../components/icons'
import { formatCommunityDate } from './community-market-utils'
import { formatNewsDate } from './community-news-utils'
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS } from './community-task-utils'
import { INSTALL_STATUS_LABELS, USER_ROLE_LABELS } from './community-user-utils'
import {
  useCommunityUserCenter,
  type UserCenterSection,
} from './useCommunityUserCenter'

const SECTIONS: Array<{ key: UserCenterSection; label: string }> = [
  { key: 'publishes', label: '我的发布' },
  { key: 'messages', label: '我的留言' },
  { key: 'installs', label: '安装记录' },
  { key: 'likes', label: '喜欢' },
  { key: 'favorites', label: '收藏' },
  { key: 'tasks', label: '我的任务' },
]

export function UserCenterPanel() {
  const [section, setSection] = useState<UserCenterSection>('publishes')
  const center = useCommunityUserCenter()

  const profile = center.profile

  return (
    <div className="tm-community-market tm-community-user-center">
      <header className="tm-community-market-header">
        <div>
          <h2 className="tm-community-market-title">我的</h2>
          <p className="tm-community-market-subtitle">
            {profile
              ? `${profile.displayName} · ${USER_ROLE_LABELS[profile.role]}`
              : '查看我的发布、安装、收藏与任务'}
          </p>
        </div>
        <button
          type="button"
          className="tm-btn"
          title="刷新"
          aria-label="刷新"
          disabled={center.loading}
          onClick={() => void center.load()}
        >
          <IconRefresh size={14} />
        </button>
      </header>

      {center.profileError ? <div className="tm-error-bar">{center.profileError}</div> : null}
      {center.error ? <div className="tm-error-bar">{center.error}</div> : null}

      <div className="tm-kb-file-panel tm-community-user-content">
        {profile ? (
          <div className="tm-community-user-profile-card">
            <div className="tm-knowledge-detail-grid">
              <div className="tm-knowledge-stat">
                <span className="tm-knowledge-stat-label">发布</span>
                <span className="tm-knowledge-stat-value">{center.publishes.length}</span>
              </div>
              <div className="tm-knowledge-stat">
                <span className="tm-knowledge-stat-label">留言</span>
                <span className="tm-knowledge-stat-value">{center.messages.length}</span>
              </div>
              <div className="tm-knowledge-stat">
                <span className="tm-knowledge-stat-label">安装</span>
                <span className="tm-knowledge-stat-value">{center.installs.length}</span>
              </div>
              <div className="tm-knowledge-stat">
                <span className="tm-knowledge-stat-label">喜欢</span>
                <span className="tm-knowledge-stat-value">{center.likeCount}</span>
              </div>
              <div className="tm-knowledge-stat">
                <span className="tm-knowledge-stat-label">收藏</span>
                <span className="tm-knowledge-stat-value">{center.favoriteCount}</span>
              </div>
              <div className="tm-knowledge-stat">
                <span className="tm-knowledge-stat-label">任务</span>
                <span className="tm-knowledge-stat-value">
                  {center.tasks.published.length + center.tasks.assigned.length}
                </span>
              </div>
            </div>
            {profile.bio ? <p className="tm-community-user-bio">{profile.bio}</p> : null}
          </div>
        ) : null}

        <nav className="tm-community-user-tabs" aria-label="我的分区">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={[
                'tm-community-user-tab',
                section === item.key ? 'tm-community-user-tab--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="tm-community-user-section">
          {center.profileLoading || center.loading ? (
            <div className="tm-session-empty">加载个人数据中…</div>
          ) : !profile ? (
            <div className="tm-kb-file-panel-empty">
              <p>请先登录 Community 账户</p>
            </div>
          ) : section === 'publishes' ? (
            center.publishes.length === 0 ? (
              <div className="tm-kb-file-panel-empty">
                <p>暂无发布资源</p>
              </div>
            ) : (
            <ul className="tm-community-user-list">
              {center.publishes.map((item) => (
                <li key={item.id} className="tm-community-user-list-item">
                  <div className="tm-community-market-item-title">{item.title}</div>
                  <div className="tm-community-market-item-meta">
                    <span>{item.resourceType}</span>
                    <span>·</span>
                    <span>{item.status}</span>
                    <span>·</span>
                    <span>v{item.version}</span>
                    <span>·</span>
                    <span>{formatCommunityDate(item.updatedAt)}</span>
                  </div>
                  {item.description ? (
                    <p className="tm-community-market-item-desc">{item.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : section === 'messages' ? (
          center.messages.length === 0 ? (
            <div className="tm-kb-file-panel-empty">
              <p>暂无留言</p>
            </div>
          ) : (
            <ul className="tm-community-user-list">
              {center.messages.map((item) => (
                <li key={item.id} className="tm-community-user-list-item">
                  <div className="tm-community-market-item-title">{item.body}</div>
                  <div className="tm-community-market-item-meta">
                    <span>留言</span>
                    <span>·</span>
                    <span>{formatCommunityDate(item.createdAt)}</span>
                    <span>·</span>
                    <span>{item.likeCount} 赞</span>
                    <span>·</span>
                    <span>{item.favoriteCount} 收藏</span>
                    {item.replyCount > 0 ? (
                      <>
                        <span>·</span>
                        <span>{item.replyCount} 回复</span>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : section === 'installs' ? (
          center.installs.length === 0 ? (
            <div className="tm-kb-file-panel-empty">
              <p>暂无安装记录</p>
            </div>
          ) : (
            <ul className="tm-community-user-list">
              {center.installs.map((item) => (
                <li key={item.id} className="tm-community-user-list-item">
                  <div className="tm-community-market-item-title">资源 {item.resourceId}</div>
                  <div className="tm-community-market-item-meta">
                    <span>{INSTALL_STATUS_LABELS[item.installStatus]}</span>
                    <span>·</span>
                    <span>{formatCommunityDate(item.installedAt)}</span>
                    {item.localRef ? (
                      <>
                        <span>·</span>
                        <span>{item.localRef}</span>
                      </>
                    ) : null}
                  </div>
                  {item.errorMessage ? (
                    <p className="tm-community-news-source-error">{item.errorMessage}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : section === 'likes' ? (
          center.likeCount === 0 ? (
            <div className="tm-kb-file-panel-empty">
              <p>暂无喜欢内容</p>
            </div>
          ) : (
            <div className="tm-community-user-task-groups">
              {center.likes.news.length > 0 ? (
                <section>
                  <h3 className="tm-community-news-section-label">资讯</h3>
                  <ul className="tm-community-user-list">
                    {center.likes.news.map((item) => (
                      <li key={`news-${item.id}`} className="tm-community-user-list-item">
                        <div className="tm-community-market-item-title">{item.title}</div>
                        <div className="tm-community-market-item-meta">
                          <span>{item.sourceTitle}</span>
                          <span>·</span>
                          <span>{formatNewsDate(item.publishedAt)}</span>
                          <span>·</span>
                          <span>{item.likeCount} 赞</span>
                        </div>
                        {item.summary ? (
                          <p className="tm-community-market-item-desc">{item.summary}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {center.likes.messages.length > 0 ? (
                <section>
                  <h3 className="tm-community-news-section-label">留言</h3>
                  <ul className="tm-community-user-list">
                    {center.likes.messages.map((item) => (
                      <li key={`message-${item.id}`} className="tm-community-user-list-item">
                        <div className="tm-community-market-item-title">{item.body}</div>
                        <div className="tm-community-market-item-meta">
                          <span>{item.author.displayName}</span>
                          <span>·</span>
                          <span>{formatCommunityDate(item.createdAt)}</span>
                          <span>·</span>
                          <span>{item.likeCount} 赞</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )
        ) : section === 'favorites' ? (
          center.favoriteCount === 0 ? (
            <div className="tm-kb-file-panel-empty">
              <p>暂无收藏内容</p>
            </div>
          ) : (
            <div className="tm-community-user-task-groups">
              {center.favorites.news.length > 0 ? (
                <section>
                  <h3 className="tm-community-news-section-label">资讯</h3>
                  <ul className="tm-community-user-list">
                    {center.favorites.news.map((item) => (
                      <li key={`news-${item.id}`} className="tm-community-user-list-item">
                        <div className="tm-community-market-item-title">{item.title}</div>
                        <div className="tm-community-market-item-meta">
                          <span>{item.sourceTitle}</span>
                          <span>·</span>
                          <span>{formatNewsDate(item.publishedAt)}</span>
                          <span>·</span>
                          <span>{item.favoriteCount} 收藏</span>
                        </div>
                        {item.summary ? (
                          <p className="tm-community-market-item-desc">{item.summary}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {center.favorites.messages.length > 0 ? (
                <section>
                  <h3 className="tm-community-news-section-label">留言</h3>
                  <ul className="tm-community-user-list">
                    {center.favorites.messages.map((item) => (
                      <li key={`message-${item.id}`} className="tm-community-user-list-item">
                        <div className="tm-community-market-item-title">{item.body}</div>
                        <div className="tm-community-market-item-meta">
                          <span>{item.author.displayName}</span>
                          <span>·</span>
                          <span>{formatCommunityDate(item.createdAt)}</span>
                          <span>·</span>
                          <span>{item.favoriteCount} 收藏</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )
        ) : center.tasks.published.length === 0 && center.tasks.assigned.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>暂无相关任务</p>
          </div>
        ) : (
          <div className="tm-community-user-task-groups">
            {center.tasks.published.length > 0 ? (
              <section>
                <h3 className="tm-community-news-section-label">我发布的</h3>
                <ul className="tm-community-user-list">
                  {center.tasks.published.map((task) => (
                    <li key={task.id} className="tm-community-user-list-item">
                      <div className="tm-community-market-item-title">{task.title}</div>
                      <div className="tm-community-market-item-meta">
                        <span>{TASK_TYPE_LABELS[task.taskType]}</span>
                        <span>·</span>
                        <span>{TASK_STATUS_LABELS[task.status]}</span>
                        <span>·</span>
                        <span>{formatCommunityDate(task.updatedAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {center.tasks.assigned.length > 0 ? (
              <section>
                <h3 className="tm-community-news-section-label">我接单的</h3>
                <ul className="tm-community-user-list">
                  {center.tasks.assigned.map((task) => (
                    <li key={task.id} className="tm-community-user-list-item">
                      <div className="tm-community-market-item-title">{task.title}</div>
                      <div className="tm-community-market-item-meta">
                        <span>{task.publisher.displayName}</span>
                        <span>·</span>
                        <span>{TASK_STATUS_LABELS[task.status]}</span>
                        <span>·</span>
                        <span>{formatCommunityDate(task.updatedAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
