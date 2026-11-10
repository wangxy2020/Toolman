import { useEffect, useState } from 'react'
import {
  createCommunityResource,
  type CommunityResourceType,
} from './communityHubClient'
import {
  COMMUNITY_RESOURCE_LABEL,
  parseTags,
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
