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
  prepareCommunityKnowledgePackage,
  patchCommunityResource,
  publishCommunityResource,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { buildResourcePublishSuccessMessage } from './community-resource-status'
import { canModerationResubmitResource } from './community-user-center-status'
import { useI18n } from '../../i18n/useI18n'
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
  const { t } = useI18n()
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
  const submitLabel = editOnly
    ? t('communityPage.publish.saveChanges')
    : requireReview
      ? t('communityPage.publish.submitReview')
      : t('communityPage.resourcePublish.publishLabel', { label: resourceLabel })

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
          name: t('communityPage.resourcePublish.packageFilterName'),
          extensions,
        },
      ],
    })
    if (!result.ok || !result.data) return
    const data = result.data as { paths: string[] }
    if (data.paths.length === 0) return
    const pickedPath = data.paths[0] ?? ''
    const autoConvertTypes: CommunityResourceType[] = ['mcp', 'skill', 'workflow', 'knowledge']
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
              : resourceType === 'workflow'
                ? await prepareCommunityWorkflowPackage(pickedPath, inferredTitle)
                : await prepareCommunityKnowledgePackage(pickedPath, inferredTitle)
        setPackagePath(prepared.packagePath)
        setPackageNotice(prepared.message ?? t('communityPage.resourcePublish.packageReady'))
        if (!title.trim()) {
          setTitle(getPackageDisplayName(pickedPath).replace(/\.[^.]+$/, ''))
        }
      } catch (prepareError) {
        setPackagePath('')
        const fallbackLabel =
          resourceType === 'mcp'
            ? 'MCP'
            : resourceType === 'skill'
              ? 'Skill'
              : t('communityPage.resourcePublish.workflowLabel')
        const message =
          prepareError instanceof Error
            ? prepareError.message
            : t('communityPage.resourcePublish.packageConvertFailed', { label: fallbackLabel })
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
      setError(t('communityPage.resourcePublish.selectKnowledgeBase'))
      return
    }
    setPackagingKb(true)
    setError(null)
    try {
      const exported = await exportCommunityKnowledgeBundle(selectedKbId)
      setPackagePath(exported.packagePath)
      setPackageNotice(t('communityPage.resourcePublish.kbPackReady'))
      setError(null)
      const selected = knowledgeBases.find((item) => item.id === selectedKbId)
      if (selected && !title.trim()) {
        setTitle(selected.name)
      }
      if (selected?.description && !description.trim()) {
        setDescription(selected.description)
      }
    } catch (packError) {
      const message =
        packError instanceof Error ? packError.message : t('communityPage.resourcePublish.kbPackFailed')
      setError(message)
    } finally {
      setPackagingKb(false)
    }
  }

  const handlePackageMcpServer = async () => {
    if (!selectedMcpId) {
      setError(t('communityPage.resourcePublish.selectMcpServer'))
      return
    }
    setPackagingMcp(true)
    try {
      const exported = await exportCommunityMcpPackage(selectedMcpId)
      setPackagePath(exported.packagePath)
      setPackageNotice(t('communityPage.resourcePublish.mcpPackReady'))
      setError(null)
      const selected = mcpServers.find((item) => item.id === selectedMcpId)
      if (selected && !title.trim()) {
        setTitle(selected.name)
      }
      if (selected?.description && !description.trim()) {
        setDescription(selected.description)
      }
    } catch (packError) {
      const message =
        packError instanceof Error ? packError.message : t('communityPage.resourcePublish.mcpPackFailed')
      setError(message)
    } finally {
      setPackagingMcp(false)
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError(t('communityPage.resourcePublish.fillTitle'))
      return
    }
    if (!editOnly && !packagePath) {
      setError(
        requireReview
          ? t('communityPage.resourcePublish.selectPackageReview')
          : t('communityPage.resourcePublish.selectPackagePublish'),
      )
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
        onPublished?.(t('communityPage.resourcePublish.successEdit'))
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
      const successMessage = buildResourcePublishSuccessMessage(published.status, requireReview, t)
      onPublished?.(successMessage)
      onClose()
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : t('communityPage.resourcePublish.publishFailed', { label: resourceLabel })
      const isMultipartError = message.toLowerCase().includes('multipart')
      const isChecksumError = message.toLowerCase().includes('sha256sums')
      if (createdId && !isMultipartError) {
        try {
          const existing = await getCommunityResource(createdId)
          if (existing.status === 'pending_review' || existing.status === 'published') {
            notifyCommunityUserDataChanged()
            onPublished?.(buildResourcePublishSuccessMessage(existing.status, requireReview, t))
            onClose()
            return
          }
        } catch {
          // fall through to error display
        }
      }
      setError(
        isChecksumError
          ? t('communityPage.resourcePublish.checksumHint', {
              message,
              manifest: publishConfig.manifestFile,
            })
          : isMultipartError
            ? t('communityPage.resourcePublish.multipartHint', { message })
            : createdId && !isResume
              ? t('communityPage.resourcePublish.draftSavedHint', { message })
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

  const modalTitle = editOnly
    ? t('communityPage.resourcePublish.titleEdit', { label: resourceLabel })
    : isRejected
      ? t('communityPage.resourcePublish.titleResubmit', { label: resourceLabel })
      : isResume
        ? t('communityPage.resourcePublish.titleContinue', { label: resourceLabel })
        : requireReview
          ? t('communityPage.resourcePublish.titleSubmitReview', { label: resourceLabel })
          : t('communityPage.resourcePublish.titlePublish', { label: resourceLabel })

  return (
    <CommunityPublishModalShell
      title={modalTitle}
      onClose={handleClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={handleClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? t('communityPage.publish.submitting') : submitLabel}
          confirmDisabled={submitting || packagingKb || packagingMcp || preparingPackage}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {packageNotice ? <CommunityPublishModalNotice message={packageNotice} /> : null}
      {isDraftResume && !editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.resourcePublish.draftUploadNotice')} />
      ) : null}
      {isRejected && !editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.resourcePublish.rejectedNotice')} />
      ) : null}
      {editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.resourcePublish.editNotice')} />
      ) : null}

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.resourcePublish.titleField', { label: resourceLabel })}{' '}
          <span className="tm-community-publish-required">{t('communityPage.publish.required')}</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('communityPage.resourcePublish.titlePlaceholder', { label: resourceLabel })}
          readOnly={readOnlyMeta}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">{t('communityPage.resourcePublish.descriptionLabel')}</span>
        <textarea
          className="tm-community-publish-textarea"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('communityPage.resourcePublish.descriptionPlaceholder')}
          readOnly={readOnlyMeta}
        />
      </label>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.categoryLabel')}</span>
          <input
            type="text"
            className="tm-community-publish-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={publishConfig.categoryPlaceholder}
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.tagsLabel')}</span>
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
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.licenseLabel')}</span>
          <input
            type="text"
            className="tm-community-publish-input tm-community-publish-input--medium"
            value={license}
            onChange={(event) => setLicense(event.target.value)}
            placeholder="MIT"
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.versionLabel')}</span>
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
          {t('communityPage.resourcePublish.changelogLabel')}{' '}
          <span className="tm-community-publish-label-optional">{t('communityPage.publish.optional')}</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={changelog}
          onChange={(event) => setChangelog(event.target.value)}
          placeholder={t('communityPage.resourcePublish.changelogPlaceholder')}
        />
      </label>

      <div className="tm-community-publish-field tm-community-publish-field--upload">
        <span className="tm-community-publish-label">{t('communityPage.resourcePublish.packageLabel')}</span>
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
                  <span className="tm-community-publish-label">{t('communityPage.resourcePublish.localKnowledgeBase')}</span>
                  <select
                    className="tm-community-publish-input tm-community-publish-input--select"
                    value={selectedKbId}
                    onChange={(event) => setSelectedKbId(event.target.value)}
                  >
                    {knowledgeBases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.kind === 'shared' ? t('communityPage.resourcePublish.sharedSuffix') : ''}
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
                    {packagingKb
                      ? t('communityPage.resourcePublish.packingKb')
                      : t('communityPage.resourcePublish.packKb')}
                  </button>
                </div>
              </div>
            ) : (
              <CommunityPublishModalNotice message={t('communityPage.resourcePublish.kbEmptyHint')} />
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
                  <span className="tm-community-publish-label">{t('communityPage.resourcePublish.localMcpConfig')}</span>
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
                    {packagingMcp
                      ? t('communityPage.resourcePublish.exportingMcp')
                      : t('communityPage.resourcePublish.exportMcp')}
                  </button>
                </div>
              </div>
            ) : (
              <CommunityPublishModalNotice message={t('communityPage.resourcePublish.mcpEmptyHint')} />
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
                ? t('communityPage.resourcePublish.convertingPackage')
                : packageDisplayName || publishConfig.packagePickerPlaceholder}
            </div>
            <button
              type="button"
              className="tm-community-publish-upload-btn"
              disabled={preparingPackage || submitting}
              onClick={() => void handlePickPackage()}
            >
              {preparingPackage
                ? t('communityPage.resourcePublish.converting')
                : t('communityPage.resourcePublish.pickFile')}
            </button>
          </div>
          <p className="tm-community-publish-upload-hint">
            <span className="tm-community-publish-upload-hint-icon" aria-hidden="true">
              ⓘ
            </span>
            <span>
              {publishConfig.packageHint}{' '}
              {t('communityPage.resourcePublish.packageMustInclude', {
                file: publishConfig.manifestFile,
              })}
            </span>
          </p>
        </div>
      </div>
        </>
      ) : null}
    </CommunityPublishModalShell>
  )
}
