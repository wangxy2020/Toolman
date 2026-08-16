import { useEffect, useState } from 'react'
import {
  createCommunityBoardMessage,
  createCommunityTask,
  publishCommunityTask,
  type CommunityTaskType,
} from './communityHubClient'
import {
  buildMessageBody,
  parseTags,
  validateMessagePublish,
  validateTaskPublish,
} from './communityPublishValidators'
import type { SharedPublishProps } from './useCommunityPublishModals.types'

export function useCommunityMessagePublish(props: SharedPublishProps) {
  const { visible, hubBaseUrl, userId, onClose, onPublished } = props
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setBody('')
    setError(null)
    setSubmitting(false)
  }, [visible])

  const handleSubmit = async () => {
    const invalid = validateMessagePublish(title, body)
    if (invalid) {
      setError(invalid)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createCommunityBoardMessage(hubBaseUrl, { body: buildMessageBody(title, body) }, userId)
      onPublished()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布留言失败')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    title,
    setTitle: (value: string) => {
      setTitle(value)
      setError(null)
    },
    body,
    setBody: (value: string) => {
      setBody(value)
      setError(null)
    },
    submitting,
    error,
    confirmDisabled: !title.trim() && !body.trim(),
    handleSubmit,
  }
}

export function useCommunityTaskPublish(props: SharedPublishProps) {
  const { visible, hubBaseUrl, userId, onClose, onPublished } = props
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<CommunityTaskType>('development')
  const [budgetAmount, setBudgetAmount] = useState('0')
  const [budgetCurrency, setBudgetCurrency] = useState('CNY')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setDescription('')
    setTaskType('development')
    setBudgetAmount('0')
    setBudgetCurrency('CNY')
    setTags('')
    setError(null)
    setSubmitting(false)
  }, [visible])

  const handleSubmit = async () => {
    const invalid = validateTaskPublish(title)
    if (invalid) {
      setError(invalid)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createCommunityTask(
        hubBaseUrl,
        {
          title: title.trim(),
          description: description.trim(),
          taskType,
          budgetAmount: Number(budgetAmount) || 0,
          budgetCurrency: budgetCurrency.trim() || 'CNY',
          tags: parseTags(tags),
        },
        userId,
      )
      await publishCommunityTask(hubBaseUrl, created.id, userId)
      onPublished()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    title,
    setTitle: (value: string) => {
      setTitle(value)
      setError(null)
    },
    description,
    setDescription,
    taskType,
    setTaskType,
    budgetAmount,
    setBudgetAmount,
    budgetCurrency,
    setBudgetCurrency,
    tags,
    setTags,
    submitting,
    error,
    handleSubmit,
  }
}
