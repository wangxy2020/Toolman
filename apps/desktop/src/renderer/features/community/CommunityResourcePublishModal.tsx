import { useEffect, useMemo, useState } from 'react'

import { IpcChannel, type CommunityResourceItem, type CommunityResourceType, type KnowledgeBase } from '@toolman/shared'

import {
  COMMUNITY_RESOURCE_PUBLISH_CONFIG,
  parsePublishTags,
} from './community-publish-config'
import {
  createCommunityResource,
  exportCommunityKnowledgeBundle,
  getCommunityHubHealth,
  getCommunityResource,
  publishCommunityResource,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { buildResourcePublishSuccessMessage } from './community-resource-status'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalNotice,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

interface Props {
  resourceType: CommunityResourceType
  resourceLabel: string
  /** Continue publish for an existing draft (skip create step). */
  resumeResource?: CommunityResourceItem | null
  onClose: () => void
  onPublished?: (message: string) => void
}

function getPackageDisplayName(path: string): string {
  if (!path) return ''
  const segments = path.split(/[/\\]/)
  return segments[segments.length - 1] ?? path
}

export function CommunityResourcePublishModal({
  resourceType,
  resourceLabel,
  resumeResource = null,
  onClose,
  onPublished,
}: Props) {
  const isResume = Boolean(resumeResource)
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
  const [success, setSuccess] = useState<string | null>(null)
  const [requireReview, setRequireReview] = useState(true)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKbId, setSelectedKbId] = useState('')
  const [packagingKb, setPackagingKb] = useState(false)

  const packageDisplayName = useMemo(() => getPackageDisplayName(packagePath), [packagePath])
  const submitLabel = requireReview ? '提交审核' : `发布${resourceLabel}`

  useEffect(() => {
    void getCommunityHubHealth()
      .then((health) => setRequireReview(health.requireReview ?? false))
      .catch(() => setRequireReview(true))
  }, [])

  useEffect(() => {
    if (!resumeResource) return
    setTitle(resumeResource.title)
    setDescription(resumeResource.description ?? '')
    setCategory(resumeResource.category ?? '')
    setLicense(resumeResource.license || 'MIT')
    setTags(resumeResource.tags.join(', '))
    setVersion(resumeResource.version === '0.0.0' ? '1.0.0' : resumeResource.version)
    setPackagePath('')
    setChangelog('')
    setError(null)
    setSuccess(null)
  }, [resumeResource])

  useEffect(() => {
    if (resourceType !== 'knowledge') return
    void (async () => {
      const workspaces = await window.api.invoke(IpcChannel.P2pWorkspaceList, { filter: 'mine' })
      if (!workspaces.ok || !workspaces.data) return
      const workspaceId = (workspaces.data as { items: Array<{ id: string }> }).items[0]?.id
      if (!workspaceId) return
      const result = await window.api.invoke(IpcChannel.KnowledgeBaseList, { workspaceId })
      if (!result.ok || !result.data) return
      const items = (result.data as { items: KnowledgeBase[] }).items.filter(
        (item) => item.kind === 'shared' || item.kind === 'local',
      )
      setKnowledgeBases(items)
      if (items[0]) {
        setSelectedKbId(items[0].id)
      }
    })()
  }, [resourceType])

  const handlePickPackage = async () => {
    const extensions = publishConfig.packageExtensions
    const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      filters: [
        {
          name: '资源包',
          extensions,
        },
      ],
    })
    if (!result.ok || !result.data) return
    const data = result.data as { paths: string[] }
    if (data.paths.length === 0) return
    setPackagePath(data.paths[0] ?? '')
  }

  const handlePackageKnowledgeBase = async () => {
    if (!selectedKbId) {
      setError('请选择要打包的知识库')
      return
    }
    setPackagingKb(true)
    setError(null)
    try {
      const exported = await exportCommunityKnowledgeBundle(selectedKbId)
      setPackagePath(exported.packagePath)
      const selected = knowledgeBases.find((item) => item.id === selectedKbId)
      if (selected && !title.trim()) {
        setTitle(selected.name)
      }
      if (selected?.description && !description.trim()) {
        setDescription(selected.description)
      }
    } catch (packError) {
      const message = packError instanceof Error ? packError.message : '知识库打包失败'
      setError(message)
    } finally {
      setPackagingKb(false)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请填写资源标题')
      return
    }
    if (!packagePath) {
      setError(requireReview ? '请选择或打包要提交的资源包' : '请选择要发布的资源包')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)
    let createdId: string | undefined = resumeResource?.id
    try {
      const resourceId =
        resumeResource?.id ??
        (
          await createCommunityResource({
            title: title.trim(),
            description: description.trim() || undefined,
            resourceType,
            category: category.trim() || undefined,
            license: license.trim() || undefined,
            tags: parsePublishTags(tags),
          })
        ).id
      createdId = resourceId
      const published = await publishCommunityResource({
        id: resourceId,
        resourceType,
        version: version.trim() || '1.0.0',
        changelog: changelog.trim() || undefined,
        packagePath,
      })
      notifyCommunityUserDataChanged()
      onPublished?.(buildResourcePublishSuccessMessage(published.status, requireReview))
      onClose()
    } catch (submitError) {
      if (createdId) {
        try {
          const existing = await getCommunityResource(createdId)
          if (existing.status === 'pending_review' || existing.status === 'published') {
            notifyCommunityUserDataChanged()
            onPublished?.(buildResourcePublishSuccessMessage(existing.status, requireReview))
            onClose()
            return
          }
        } catch {
          // fall through to error display
        }
      }
      const message = submitError instanceof Error ? submitError.message : `发布${resourceLabel}失败`
      setError(
        createdId && !isResume
          ? `${message}。资源已保存为草稿，可在「我的」中点击「提交审核」重试。`
          : message,
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  return (
    <CommunityPublishModalShell
      title={
        isResume
          ? `继续提交${resourceLabel}审核`
          : requireReview
            ? `提交${resourceLabel}审核`
            : `发布${resourceLabel}`
      }
      onClose={handleClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={handleClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? '提交中…' : success ? '关闭' : submitLabel}
          confirmDisabled={submitting || packagingKb}
          onConfirm={() => (success ? handleClose() : void handleSubmit())}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {success ? <CommunityPublishModalNotice message={success} /> : null}
      {isResume ? (
        <CommunityPublishModalNotice message="上次提交未完成资源包上传。请选择或打包资源包后重新提交，管理员才能看到待审核条目。" />
      ) : null}

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
          readOnly={isResume}
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
          readOnly={isResume}
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
        <span className="tm-community-publish-label">资源包</span>
        {resourceType === 'knowledge' && knowledgeBases.length > 0 ? (
          <div className="tm-community-publish-grid" style={{ marginBottom: 12 }}>
            <label className="tm-community-publish-field">
              <span className="tm-community-publish-label">从本地知识库打包</span>
              <select
                className="tm-community-publish-input tm-community-publish-input--select"
                value={selectedKbId}
                onChange={(event) => setSelectedKbId(event.target.value)}
              >
                {knowledgeBases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.kind === 'shared' ? '（共享）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="tm-community-publish-field">
              <span className="tm-community-publish-label">&nbsp;</span>
              <button
                type="button"
                className="tm-community-publish-upload-btn"
                disabled={packagingKb || submitting}
                onClick={() => void handlePackageKnowledgeBase()}
              >
                {packagingKb ? '打包中…' : '一键打包'}
              </button>
            </div>
          </div>
        ) : null}
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
              {publishConfig.packageHint} 需包含 <code>{publishConfig.manifestFile}</code>。
            </span>
          </p>
        </div>
      </div>
    </CommunityPublishModalShell>
  )
}
