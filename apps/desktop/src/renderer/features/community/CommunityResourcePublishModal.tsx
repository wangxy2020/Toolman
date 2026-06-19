import { useEffect, useState } from 'react'

import { IpcChannel, type CommunityResourceType } from '@toolman/shared'

import {
  COMMUNITY_RESOURCE_PUBLISH_CONFIG,
  parsePublishTags,
} from './community-publish-config'
import {
  createCommunityResource,
  publishCommunityResource,
} from './community-api.client'

interface Props {
  resourceType: CommunityResourceType
  resourceLabel: string
  onClose: () => void
  onPublished?: () => void
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal--narrow tm-modal--form" onClick={(event) => event.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">发布{resourceLabel}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error ? <div className="tm-error-bar">{error}</div> : null}

          <label className="tm-form-field">
            <span className="tm-form-label">标题</span>
            <input
              className="tm-form-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`例如：社区${resourceLabel}示例`}
            />
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">描述</span>
            <textarea
              className="tm-form-textarea"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="简要说明资源用途、适用场景与使用方式"
            />
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">分类</span>
            <input
              className="tm-form-input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={publishConfig.categoryPlaceholder}
            />
          </label>

          <div className="tm-community-task-form-row">
            <label className="tm-form-field">
              <span className="tm-form-label">许可证</span>
              <input
                className="tm-form-input"
                value={license}
                onChange={(event) => setLicense(event.target.value)}
                placeholder="MIT"
              />
            </label>
            <label className="tm-form-field">
              <span className="tm-form-label">版本号</span>
              <input
                className="tm-form-input"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              />
            </label>
          </div>

          <label className="tm-form-field">
            <span className="tm-form-label">标签</span>
            <input
              className="tm-form-input"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={publishConfig.tagsPlaceholder}
            />
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">更新说明</span>
            <input
              className="tm-form-input"
              value={changelog}
              onChange={(event) => setChangelog(event.target.value)}
              placeholder="可选，说明本次发布变更"
            />
          </label>

          <div className="tm-form-field">
            <span className="tm-form-label">资源包 (ZIP)</span>
            <p className="tm-community-publish-hint">
              需包含 <code>{publishConfig.manifestFile}</code>。{publishConfig.packageHint}
            </p>
            <div className="tm-community-publish-package-row">
              <input
                className="tm-form-input"
                value={packagePath}
                readOnly
                placeholder="选择符合 manifest 规范的 ZIP 包"
              />
              <button type="button" className="tm-btn" onClick={() => void handlePickPackage()}>
                选择文件
              </button>
            </div>
          </div>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '发布中…' : `发布${resourceLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}
