import { useEffect, useMemo, useState } from 'react'
import type { MobileCreatedKbKind } from '../storage/createdKnowledgeBases'
import {
  buildKnowledgeCreateForm,
  deriveNameFromUrl,
  knowledgeCreateKindHint,
  knowledgeCreateNamePlaceholder,
  normalizeKnowledgeUrl,
  type KnowledgeCreateForm,
} from './knowledgeCreateUtils'

export type KnowledgeCreateModalProps = {
  visible: boolean
  submitting?: boolean
  onClose: () => void
  onSubmit: (input: KnowledgeCreateForm) => Promise<void> | void
}

export function useKnowledgeCreateModal(props: KnowledgeCreateModalProps) {
  const { visible, onSubmit } = props
  const [name, setName] = useState('')
  const [kind, setKind] = useState<MobileCreatedKbKind>('sync')
  const [description, setDescription] = useState('')
  const [networkUrl, setNetworkUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setName('')
    setKind('sync')
    setDescription('')
    setNetworkUrl('')
    setError(null)
  }, [visible])

  const isNetwork = kind === 'network'
  const namePlaceholder = knowledgeCreateNamePlaceholder(isNetwork)
  const kindHint = useMemo(() => knowledgeCreateKindHint(kind), [kind])

  const changeName = (value: string) => {
    setName(value)
    setError(null)
  }

  const changeKind = (next: MobileCreatedKbKind) => {
    setKind(next)
    setError(null)
  }

  const handleUrlChange = (value: string) => {
    setNetworkUrl(value)
    setError(null)
    if (!name.trim() && value.trim()) {
      setName(deriveNameFromUrl(normalizeKnowledgeUrl(value)))
    }
  }

  const handleSubmit = async () => {
    const result = buildKnowledgeCreateForm({ name, kind, description, networkUrl })
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    await onSubmit(result.form)
  }

  return {
    name,
    changeName,
    kind,
    changeKind,
    description,
    setDescription,
    networkUrl,
    handleUrlChange,
    error,
    isNetwork,
    namePlaceholder,
    kindHint,
    handleSubmit,
  }
}
