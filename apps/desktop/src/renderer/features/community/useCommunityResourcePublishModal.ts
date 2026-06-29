import { useEffect, useMemo, useState } from 'react'

import { IpcChannel, type KnowledgeBase, type McpServerConfig } from '@toolman/shared'

import { COMMUNITY_RESOURCE_PUBLISH_CONFIG } from './community-publish-config'
import { getCommunityHubHealth } from './community-api.client'
import { canModerationResubmitResource } from './community-user-center-status'
import {
  packageCommunityKnowledgeBase,
  packageCommunityMcpServer,
  pickCommunityResourcePackage,
} from './community-resource-publish-handlers'
import { submitCommunityResourcePublish } from './community-resource-publish-submit'
import {
  type CommunityResourcePublishModalProps,
  getPackageDisplayName,
} from './community-resource-publish-types'
import { useI18n } from '../../i18n/useI18n'

export function useCommunityResourcePublishModal({
  resourceType,
  resourceLabel,
  resumeResource = null,
  editOnly = false,
  onClose,
  onPublished,
}: CommunityResourcePublishModalProps) {
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

  const handlePickPackage = () =>
    pickCommunityResourcePackage({
      resourceType,
      title,
      t,
      setPreparingPackage,
      setPackageNotice,
      setError,
      setPackagePath,
      setTitle,
    })

  const handlePackageKnowledgeBase = () =>
    packageCommunityKnowledgeBase({
      selectedKbId,
      knowledgeBases,
      title,
      description,
      t,
      setPackagingKb,
      setError,
      setPackagePath,
      setPackageNotice,
      setTitle,
      setDescription,
    })

  const handlePackageMcpServer = () =>
    packageCommunityMcpServer({
      selectedMcpId,
      mcpServers,
      title,
      description,
      t,
      setPackagingMcp,
      setError,
      setPackagePath,
      setPackageNotice,
      setTitle,
      setDescription,
    })

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    const result = await submitCommunityResourcePublish({
      title,
      description,
      category,
      license,
      tags,
      version,
      changelog,
      packagePath,
      editOnly,
      resumeResource,
      isRejected,
      isDraftResume,
      isResume,
      resourceType,
      resourceLabel,
      requireReview,
      publishConfig,
      t,
      onPublished,
      onClose,
    })
    if (!result.succeeded && result.error) {
      setError(result.error)
    }
    setSubmitting(false)
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

  return {
    t,
    resourceType,
    resourceLabel,
    editOnly,
    isDraftResume,
    isRejected,
    readOnlyMeta,
    showPackageUpload,
    publishConfig,
    title,
    setTitle,
    description,
    setDescription,
    category,
    setCategory,
    license,
    setLicense,
    tags,
    setTags,
    version,
    setVersion,
    changelog,
    setChangelog,
    submitting,
    error,
    packageNotice,
    packageDisplayName,
    preparingPackage,
    packagingKb,
    packagingMcp,
    knowledgeBases,
    selectedKbId,
    setSelectedKbId,
    mcpServers,
    selectedMcpId,
    setSelectedMcpId,
    showMcpAdvanced,
    setShowMcpAdvanced,
    showKbAdvanced,
    setShowKbAdvanced,
    submitLabel,
    modalTitle,
    handlePickPackage,
    handlePackageKnowledgeBase,
    handlePackageMcpServer,
    handleSubmit,
    handleClose,
  }
}

export type CommunityResourcePublishState = ReturnType<typeof useCommunityResourcePublishModal>
