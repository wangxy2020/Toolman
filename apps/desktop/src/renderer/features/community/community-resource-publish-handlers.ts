import { IpcChannel, type CommunityResourceType } from '@toolman/shared'

import { COMMUNITY_RESOURCE_PUBLISH_CONFIG } from './community-publish-config'
import {
  exportCommunityKnowledgeBundle,
  exportCommunityMcpPackage,
  prepareCommunityMcpPackage,
  prepareCommunitySkillPackage,
  prepareCommunityWorkflowPackage,
  prepareCommunityKnowledgePackage,
} from './community-api.client'
import { getPackageDisplayName } from './community-resource-publish-types'
import { useI18n } from '../../i18n/useI18n'

type Translate = ReturnType<typeof useI18n>['t']

export async function pickCommunityResourcePackage({
  resourceType,
  title,
  t,
  setPreparingPackage,
  setPackageNotice,
  setError,
  setPackagePath,
  setTitle,
}: {
  resourceType: CommunityResourceType
  title: string
  t: Translate
  setPreparingPackage: (value: boolean) => void
  setPackageNotice: (value: string | null) => void
  setError: (value: string | null) => void
  setPackagePath: (value: string) => void
  setTitle: (value: string) => void
}) {
  const publishConfig = COMMUNITY_RESOURCE_PUBLISH_CONFIG[resourceType]
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

export async function packageCommunityKnowledgeBase({
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
}: {
  selectedKbId: string
  knowledgeBases: Array<{ id: string; name: string; description?: string | null }>
  title: string
  description: string
  t: Translate
  setPackagingKb: (value: boolean) => void
  setError: (value: string | null) => void
  setPackagePath: (value: string) => void
  setPackageNotice: (value: string | null) => void
  setTitle: (value: string) => void
  setDescription: (value: string) => void
}) {
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

export async function packageCommunityMcpServer({
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
}: {
  selectedMcpId: string
  mcpServers: Array<{ id: string; name: string; description?: string | null }>
  title: string
  description: string
  t: Translate
  setPackagingMcp: (value: boolean) => void
  setError: (value: string | null) => void
  setPackagePath: (value: string) => void
  setPackageNotice: (value: string | null) => void
  setTitle: (value: string) => void
  setDescription: (value: string) => void
}) {
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
