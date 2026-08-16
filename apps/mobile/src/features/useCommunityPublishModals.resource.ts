import { useEffect, useState } from 'react'
import {
  createCommunityNewsSource,
  createCommunityResource,
  deleteCommunityNewsSource,
  fetchCommunityNewsSource,
  listCommunityNewsSources,
  type CommunityNewsSource,
  type CommunityResourceType,
} from './communityHubClient'
import {
  COMMUNITY_RESOURCE_LABEL,
  deriveNewsSourceTitle,
  parseTags,
  validateNewsFeedUrl,
  validateResourcePublish,
} from './communityPublishValidators'
import type { SharedPublishProps } from './useCommunityPublishModals.types'

export function useCommunityResourcePublish(
  props: SharedPublishProps & { resourceType: CommunityResourceType },
) {
  const { visible, hubBaseUrl, userId, resourceType, onClose, onPublished } = props
  const label = COMMUNITY_RESOURCE_LABEL[resourceType]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [license, setLicense] = useState('MIT')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setDescription('')
    setLicense('MIT')
    setTags('')
    setError(null)
    setSubmitting(false)
  }, [visible])

  const handleSubmit = async () => {
    const invalid = validateResourcePublish(title, label)
    if (invalid) {
      setError(invalid)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createCommunityResource(
        hubBaseUrl,
        {
          title: title.trim(),
          description: description.trim(),
          resourceType,
          license: license.trim() || 'MIT',
          tags: parseTags(tags),
        },
        userId,
      )
      onPublished()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : `发布${label}失败`)
    } finally {
      setSubmitting(false)
    }
  }

  return {
    label,
    title,
    setTitle: (value: string) => {
      setTitle(value)
      setError(null)
    },
    description,
    setDescription,
    license,
    setLicense,
    tags,
    setTags,
    submitting,
    error,
    handleSubmit,
  }
}

export function useCommunityNewsSources(props: SharedPublishProps) {
  const { visible, hubBaseUrl, userId, onPublished } = props
  const [sources, setSources] = useState<CommunityNewsSource[]>([])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      setSources(await listCommunityNewsSources(hubBaseUrl, userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 RSS 源失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setFeedUrl('')
    setError(null)
    void reload()
  }, [visible, hubBaseUrl, userId])

  const handleAdd = async () => {
    const url = feedUrl.trim()
    const invalid = validateNewsFeedUrl(url)
    if (invalid) {
      setError(invalid)
      return
    }
    const derivedTitle = deriveNewsSourceTitle(title, url)
    setSubmitting(true)
    setError(null)
    try {
      const source = await createCommunityNewsSource(
        hubBaseUrl,
        { title: derivedTitle, feedUrl: url },
        userId,
      )
      if (source.id) {
        try {
          await fetchCommunityNewsSource(hubBaseUrl, source.id, userId)
        } catch {
          // Source created; fetch can be retried from the list.
        }
      }
      setTitle('')
      setFeedUrl('')
      await reload()
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加 RSS 源失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFetch = async (sourceId: string) => {
    setError(null)
    try {
      await fetchCommunityNewsSource(hubBaseUrl, sourceId, userId)
      await reload()
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取失败')
    }
  }

  const handleDelete = async (sourceId: string) => {
    setError(null)
    try {
      await deleteCommunityNewsSource(hubBaseUrl, sourceId, userId)
      await reload()
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  return {
    sources,
    loading,
    title,
    setTitle,
    feedUrl,
    setFeedUrl: (value: string) => {
      setFeedUrl(value)
      setError(null)
    },
    submitting,
    error,
    handleAdd,
    handleFetch,
    handleDelete,
  }
}
