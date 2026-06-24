import { useEffect, useMemo, useState } from 'react'

import { IpcChannel, type CommunityResourceItem, type CommunityResourceType, type KnowledgeBase, type McpServerConfig } from '@toolman/shared'

import {
  COMMUNITY_RESOURCE_PUBLISH_CONFIG,
  parsePublishTags,
} from './community-publish-config'
import {
  createCommunityResource,
  exportCommunityKnowledgeBundle,
  exportCommunityMcpPackage,
  getCommunityHubHealth,
  getCommunityResource,
  prepareCommunityMcpPackage,
  prepareCommunitySkillPackage,
  prepareCommunityWorkflowPackage,
  patchCommunityResource,
  publishCommunityResource,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { buildResourcePublishSuccessMessage } from './community-resource-status'
import { canModerationResubmitResource } from './community-user-center-status'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalNotice,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

interface Props {
  resourceType: CommunityResourceType
  resourceLabel: string
  /** Continue publish for an existing draft or resubmit a rejected item. */
  resumeResource?: CommunityResourceItem | null
  /** Save metadata only (for rejected submissions). */
  editOnly?: boolean
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
  editOnly = false,
  onClose,
  onPublished,
}: Props) {
  const isResume = Boolean(resumeResource)
  const isDraftResume = resumeResource?.status === 'draft'
  const isRejected = resumeResource ? canModerationResubmitResource(resumeResource) : false
  const readOnlyMeta = isDraftResume && !editOnly
  const showPackageUpload = !editOnly
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
  const [requireReview, setRequireReview] = useState(true)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKbId, setSelectedKbId] = useState('')
  const [packagingKb, setPackagingKb] = useState(false)
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([])
  const [selectedMcpId, setSelectedMcpId] = useState('')
  const [packagingMcp, setPackagingMcp] = useState(false)
  const [preparingPackage, setPreparingPackage] = useState(false)
  const [packageNotice, setPackageNotice] = useState<string | null>(null)
  const [showMcpAdvanced, setShowMcpAdvanced] = useState(false)
  const [showKbAdvanced, setShowKbAdvanced] = useState(false)

  const packageDisplayName = useMemo(() => getPackageDisplayName(packagePath), [packagePath])
  const submitLabel = editOnly ? '保存修改' : requireReview ? '提交审核' : `发布${resourceLabel}`

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

  useEffect(() => {
    if (resourceType !== 'mcp' || !showMcpAdvanced) return
    void (async () => {
      const result = await window.api.invoke(IpcChannel.McpServerList, undefined)
      if (!result.ok || !result.data) return
      const items = (result.data as { items: McpServerConfig[] }).items.filter(
        (item) => item.type !== 'builtin',
      )
      setMcpServers(items)
      if (items[0]) {
        setSelectedMcpId(items[0].id)
      }
    })()
  }, [resourceType, showMcpAdvanced])

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
    const pickedPath = data.paths[0] ?? ''
    const autoConvertTypes: CommunityResourceType[] = ['mcp', 'skill', 'workflow']
    if (autoConvertTypes.includes(resourceType)) {
      setPreparingPackage(true)
      setPackageNotice(null)
      setError(null)
      try {
        const inferredTitle =
          title.trim() || getPackageDisplayName(pickedPath).replace(/\.[^.]+$/, '')
        const prepared =
          resourceType === 'mcp'
            ? await prepareCommunityMcpPackage(pickedPath, inferredTitle)
            : resourceType === 'skill'
              ? await prepareCommunitySkillPackage(pickedPath, inferredTitle)
              : await prepareCommunityWorkflowPackage(pickedPath, inferredTitle)
        setPackagePath(prepared.packagePath)
        setPackageNotice(prepared.message ?? '资源包已就绪，可提交审核。')
        if (!title.trim()) {
          setTitle(getPackageDisplayName(pickedPath).replace(/\.[^.]+$/, ''))
        }
      } catch (prepareError) {
        setPackagePath('')
        const fallbackLabel =
          resourceType === 'mcp' ? 'MCP' : resourceType === 'skill' ? 'Skill' : '工作流'
        const message =
          prepareError instanceof Error ? prepareError.message : `${fallbackLabel} 资源包转换失败`
        setError(message)
      } finally {
        setPreparingPackage(false)
      }
      return
    }
    setPackagePath(pickedPath)
    setPackageNotice(null)
    setError(null)
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
      setPackageNotice('已从本地知识库生成社区包，可提交审核。')
      setError(null)
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

  const handlePackageMcpServer = async () => {
    if (!selectedMcpId) {
      setError('请选择要打包的 MCP 服务器')
      return
    }
    setPackagingMcp(true)
    try {
      const exported = await exportCommunityMcpPackage(selectedMcpId)
      setPackagePath(exported.packagePath)
      setPackageNotice('已从本机 MCP 配置导出社区包，可提交审核。')
      setError(null)
      const selected = mcpServers.find((item) => item.id === selectedMcpId)
      if (selected && !title.trim()) {
        setTitle(selected.name)
      }
      if (selected?.description && !description.trim()) {
        setDescription(selected.description)
      }
    } catch (packError) {
      const message = packError instanceof Error ? packError.message : 'MCP 打包失败'
      setError(message)
    } finally {
      setPackagingMcp(false)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请填写资源标题')
      return
    }
    if (!editOnly && !packagePath) {
      setError(requireReview ? '请选择或打包要提交的资源包' : '请选择要发布的资源包')
      return
    }

    setSubmitting(true)
    setError(null)
    let createdId: string | undefined = resumeResource?.id
    try {
      if (editOnly && resumeResource) {
        await patchCommunityResource({
          id: resumeResource.id,
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          license: license.trim() || undefined,
          tags: parsePublishTags(tags),
        })
        notifyCommunityUserDataChanged()
        onPublished?.('修改已保存')
        onClose()
        return
      }

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

      if (resumeResource && (isRejected || isDraftResume)) {
        await patchCommunityResource({
          id: resourceId,
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          license: license.trim() || undefined,
          tags: parsePublishTags(tags),
        })
      }

      const published = await publishCommunityResource({
        id: resourceId,
        resourceType,
        version: version.trim() || '1.0.0',
        changelog: changelog.trim() || undefined,
        packagePath,
      })
      notifyCommunityUserDataChanged()
      const successMessage = buildResourcePublishSuccessMessage(published.status, requireReview)
      onPublished?.(successMessage)
      onClose()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : `发布${resourceLabel}失败`
      const isMultipartError = message.toLowerCase().includes('multipart')
      const isChecksumError = message.toLowerCase().includes('sha256sums')
      if (createdId && !isMultipartError) {
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
      setError(
        isChecksumError
          ? `${message}。请确认资源包包含 ${publishConfig.manifestFile} 与 SHA256SUMS，或使用下方高级选项从本机一键生成。`
          : isMultipartError
            ? `${message}。若资源包较大（>2MB），请先 Cmd+Q 退出用户 A 并重启双实例，使 Community Hub 更新生效。`
            : createdId && !isResume
              ? `${message}。资源已保存为草稿，请返回对应市场页重新选择资源包提交。`
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
        editOnly
          ? `修改${resourceLabel}`
          : isRejected
            ? `重新提交${resourceLabel}审核`
            : isResume
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
          confirmLabel={submitting ? '提交中…' : submitLabel}
          confirmDisabled={submitting || packagingKb || packagingMcp || preparingPackage}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {packageNotice ? <CommunityPublishModalNotice message={packageNotice} /> : null}
      {isDraftResume && !editOnly ? (
        <CommunityPublishModalNotice message="上次提交未完成资源包上传。请选择或打包资源包后重新提交，管理员才能看到待审核条目。" />
      ) : null}
      {isRejected && !editOnly ? (
        <CommunityPublishModalNotice message="审核未通过。请根据管理员意见修改内容或资源包后重新提交审核。" />
      ) : null}
      {editOnly ? (
        <CommunityPublishModalNotice message="修改基本信息后保存；如需更换资源包，请使用「重新提交」。" />
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
          readOnly={readOnlyMeta}
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
          readOnly={readOnlyMeta}
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

      {showPackageUpload ? (
        <>
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
        {resourceType === 'knowledge' && publishConfig.localPackSummary ? (
          <details
            className="tm-community-publish-field"
            style={{ marginBottom: 12 }}
            open={showKbAdvanced}
            onToggle={(event) => setShowKbAdvanced((event.target as HTMLDetailsElement).open)}
          >
            <summary className="tm-community-publish-label" style={{ cursor: 'pointer' }}>
              {publishConfig.localPackSummary}
            </summary>
            {knowledgeBases.length > 0 ? (
              <div className="tm-community-publish-grid" style={{ marginTop: 12 }}>
                <label className="tm-community-publish-field">
                  <span className="tm-community-publish-label">本地知识库</span>
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
                    disabled={packagingKb || submitting || preparingPackage}
                    onClick={() => void handlePackageKnowledgeBase()}
                  >
                    {packagingKb ? '打包中…' : '一键打包'}
                  </button>
                </div>
              </div>
            ) : (
              <CommunityPublishModalNotice message="展开后若列表为空，请先在「知识库」模块创建并添加文档。" />
            )}
          </details>
        ) : null}
        {resourceType === 'mcp' && publishConfig.localPackSummary ? (
          <details
            className="tm-community-publish-field"
            style={{ marginBottom: 12 }}
            open={showMcpAdvanced}
            onToggle={(event) => setShowMcpAdvanced((event.target as HTMLDetailsElement).open)}
          >
            <summary className="tm-community-publish-label" style={{ cursor: 'pointer' }}>
              {publishConfig.localPackSummary}
            </summary>
            {mcpServers.length > 0 ? (
              <div className="tm-community-publish-grid" style={{ marginTop: 12 }}>
                <label className="tm-community-publish-field">
                  <span className="tm-community-publish-label">本地 MCP 配置</span>
                  <select
                    className="tm-community-publish-input tm-community-publish-input--select"
                    value={selectedMcpId}
                    onChange={(event) => setSelectedMcpId(event.target.value)}
                  >
                    {mcpServers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}（{item.type}）
                      </option>
                    ))}
                  </select>
                </label>
                <div className="tm-community-publish-field">
                  <span className="tm-community-publish-label">&nbsp;</span>
                  <button
                    type="button"
                    className="tm-community-publish-upload-btn"
                    disabled={packagingMcp || submitting || preparingPackage}
                    onClick={() => void handlePackageMcpServer()}
                  >
                    {packagingMcp ? '导出中…' : '导出配置包'}
                  </button>
                </div>
              </div>
            ) : (
              <CommunityPublishModalNotice message="展开后若列表为空，请先在「设置 → MCP」添加自定义 MCP。" />
            )}
          </details>
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
              {preparingPackage
                ? '正在转换资源包…'
                : packageDisplayName || publishConfig.packagePickerPlaceholder}
            </div>
            <button
              type="button"
              className="tm-community-publish-upload-btn"
              disabled={preparingPackage || submitting}
              onClick={() => void handlePickPackage()}
            >
              {preparingPackage ? '转换中…' : '选择文件'}
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
        </>
      ) : null}
    </CommunityPublishModalShell>
  )
}
