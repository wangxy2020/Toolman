import { useMemo, useState } from 'react'

import { IpcChannel, type CommunityResourceType } from '@toolman/shared'

import {
  COMMUNITY_RESOURCE_PUBLISH_CONFIG,
  parsePublishTags,
} from './community-publish-config'
import {
  createCommunityResource,
  publishCommunityResource,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

interface Props {
  resourceType: CommunityResourceType
  resourceLabel: string
  onClose: () => void
  onPublished?: () => void
}

function getPackageDisplayName(path: string): string {
  if (!path) return ''
  const segments = path.split(/[/\\]/)
  return segments[segments.length - 1] ?? path
}

export function CommunityResourcePublishModal({
  resourceType,
  resourceLabel,
  onClose,
  onPublished,
}: Props) {
  const publishConfig = COMMUNITY_RESOURCE_PUBLISH_CONFIG[resourceType]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [license, setLicense] = useState('MIT')
  const [tags, setTags] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [changelog, setChangelog] = useState('')
  const [packagePath, setPackagePath] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const packageDisplayName = useMemo(() => getPackageDisplayName(packagePath), [packagePath])

  const handlePickPackage = async () => {
    const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      filters: [{ name: 'ZIP 包', extensions: ['zip'] }],
    })
    if (!result.ok || !result.data) return
    const data = result.data as { paths: string[] }
    if (data.paths.length === 0) return
    setPackagePath(data.paths[0] ?? '')
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请填写资源标题')
      return
    }
    if (!packagePath) {
      setError('请选择要发布的 ZIP 资源包')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const created = await createCommunityResource({
        title: title.trim(),
        description: description.trim() || undefined,
        resourceType,
        category: category.trim() || undefined,
        license: license.trim() || undefined,
        tags: parsePublishTags(tags),
      })
      await publishCommunityResource({
        id: created.id,
        version: version.trim() || '1.0.0',
        changelog: changelog.trim() || undefined,
        packagePath,
      })
      notifyCommunityUserDataChanged()
      onPublished?.()
      onClose()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : `发布${resourceLabel}失败`
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CommunityPublishModalShell
      title={`发布${resourceLabel}`}
      onClose={onClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={onClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? '发布中…' : `发布${resourceLabel}`}
          confirmDisabled={submitting}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {resourceLabel}标题 <span className="tm-community-publish-required">*</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`例如：社区${resourceLabel}示例`}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">详细描述</span>
        <textarea
          className="tm-community-publish-textarea"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="简要说明资源用途、适用场景与使用方式..."
        />
      </label>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">分类</span>
          <input
            type="text"
            className="tm-community-publish-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={publishConfig.categoryPlaceholder}
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">标签</span>
          <input
            type="text"
            className="tm-community-publish-input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={publishConfig.tagsPlaceholder}
          />
        </label>
      </div>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">开源许可证</span>
          <input
            type="text"
            className="tm-community-publish-input tm-community-publish-input--medium"
            value={license}
            onChange={(event) => setLicense(event.target.value)}
            placeholder="MIT"
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">版本号</span>
          <input
            type="text"
            className="tm-community-publish-input tm-community-publish-input--mono"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
        </label>
      </div>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          更新说明 <span className="tm-community-publish-label-optional">(可选)</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={changelog}
          onChange={(event) => setChangelog(event.target.value)}
          placeholder="说明本次发布变更"
        />
      </label>

      <div className="tm-community-publish-field tm-community-publish-field--upload">
        <span className="tm-community-publish-label">资源包 (ZIP)</span>
        <div className="tm-community-publish-upload-card">
          <div className="tm-community-publish-upload-row">
            <div
              className={[
                'tm-community-publish-upload-path',
                packageDisplayName ? 'tm-community-publish-upload-path--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={packagePath || undefined}
            >
              {packageDisplayName || '选择符合 manifest 规范的 ZIP 包'}
            </div>
            <button
              type="button"
              className="tm-community-publish-upload-btn"
              onClick={() => void handlePickPackage()}
            >
              选择文件
            </button>
          </div>
          <p className="tm-community-publish-upload-hint">
            <span className="tm-community-publish-upload-hint-icon" aria-hidden="true">
              ⓘ
            </span>
            <span>
              ZIP 包内需包含 <code>{publishConfig.manifestFile}</code> 核心描述文件与相关的完整
              {resourceLabel}资源。
            </span>
          </p>
        </div>
      </div>
    </CommunityPublishModalShell>
  )
}
