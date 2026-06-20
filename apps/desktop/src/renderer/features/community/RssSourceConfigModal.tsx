import { useState } from 'react'

import { SettingsToggle } from '../settings/SettingsShared'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

const RSS_ADVANCED_STORAGE_KEY = 'toolman:rss-source-advanced'

interface RssAdvancedOptions {
  enableLongTextRender: boolean
  strictGuidValidation: boolean
}

const DEFAULT_ADVANCED: RssAdvancedOptions = {
  enableLongTextRender: true,
  strictGuidValidation: false,
}

function loadAdvancedOptions(): RssAdvancedOptions {
  try {
    const raw = localStorage.getItem(RSS_ADVANCED_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_ADVANCED }
    return { ...DEFAULT_ADVANCED, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_ADVANCED }
  }
}

function saveAdvancedOptions(options: RssAdvancedOptions): void {
  localStorage.setItem(RSS_ADVANCED_STORAGE_KEY, JSON.stringify(options))
}

function deriveSourceTitle(feedUrl: string, title: string): string {
  const trimmed = title.trim()
  if (trimmed) return trimmed
  try {
    return new URL(feedUrl.trim()).hostname
  } catch {
    return 'RSS 订阅'
  }
}

export interface RssSourceConfigInput {
  title: string
  feedUrl: string
  fetchIntervalMinutes: number
  advanced: RssAdvancedOptions
}

interface Props {
  creating?: boolean
  error?: string | null
  onClose: () => void
  onSave: (input: RssSourceConfigInput) => void | Promise<void>
}

export function RssSourceConfigModal({ creating = false, error, onClose, onSave }: Props) {
  const [title, setTitle] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [fetchIntervalMinutes, setFetchIntervalMinutes] = useState('30')
  const [advanced, setAdvanced] = useState<RssAdvancedOptions>(() => loadAdvancedOptions())

  const updateAdvanced = (patch: Partial<RssAdvancedOptions>) => {
    setAdvanced((prev) => {
      const next = { ...prev, ...patch }
      saveAdvancedOptions(next)
      return next
    })
  }

  const handleSave = () => {
    const trimmedFeedUrl = feedUrl.trim()
    if (!trimmedFeedUrl) return

    const interval = Number.parseInt(fetchIntervalMinutes, 10)
    if (!Number.isFinite(interval) || interval < 5) return

    void onSave({
      title: deriveSourceTitle(trimmedFeedUrl, title),
      feedUrl: trimmedFeedUrl,
      fetchIntervalMinutes: interval,
      advanced,
    })
  }

  const canSave = feedUrl.trim().length > 0 && !creating

  return (
    <CommunityPublishModalShell
      title="配置 RSS 订阅源"
      ariaLabel="配置 RSS 订阅源"
      stacked
      onClose={onClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={onClose}
          cancelDisabled={creating}
          confirmLabel={creating ? '保存中…' : '保存订阅'}
          confirmDisabled={!canSave}
          onConfirm={handleSave}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}

      <div className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          订阅源地址 (URL) <span className="tm-community-publish-required">*</span>
        </span>
        <input
          className="tm-community-publish-input tm-community-publish-input--mono"
          type="url"
          value={feedUrl}
          placeholder="https://example.com/feed.xml"
          onChange={(event) => setFeedUrl(event.target.value)}
        />
      </div>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">
            订阅源名称 <span className="tm-community-publish-label-optional">(选填)</span>
          </span>
          <input
            type="text"
            className="tm-community-publish-input"
            value={title}
            placeholder="自定义站点名称"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="tm-community-publish-field">
          <span className="tm-community-publish-label">更新间隔</span>
          <div className="tm-community-publish-interval">
            <input
              className="tm-community-publish-interval-input"
              type="number"
              min={5}
              max={1440}
              value={fetchIntervalMinutes}
              onChange={(event) => setFetchIntervalMinutes(event.target.value)}
            />
            <span className="tm-community-publish-interval-suffix">min</span>
          </div>
        </div>
      </div>

      <div className="tm-community-publish-advanced">
        <span className="tm-community-publish-label">进阶解析选项</span>

        <div className="tm-community-publish-upload-card">
          <div className="tm-community-publish-toggle-row">
            <div className="tm-community-publish-toggle-copy">
              <span className="tm-community-publish-toggle-title">启用长文本智能渲染</span>
              <p className="tm-community-publish-toggle-desc">
                开启后将尝试抓取并解析 RSS 正文的完整 HTML 视图
              </p>
            </div>
            <SettingsToggle
              checked={advanced.enableLongTextRender}
              onChange={(enableLongTextRender) => updateAdvanced({ enableLongTextRender })}
            />
          </div>

          <div className="tm-community-publish-toggle-row tm-community-publish-toggle-row--divider">
            <div className="tm-community-publish-toggle-copy">
              <span className="tm-community-publish-toggle-title">严格校验全局唯一标示 (GUID)</span>
              <p className="tm-community-publish-toggle-desc">
                防止由于部分站点更新导致文章二次重复触发通知
              </p>
            </div>
            <SettingsToggle
              checked={advanced.strictGuidValidation}
              onChange={(strictGuidValidation) => updateAdvanced({ strictGuidValidation })}
            />
          </div>
        </div>
      </div>
    </CommunityPublishModalShell>
  )
}

export { deriveSourceTitle }
