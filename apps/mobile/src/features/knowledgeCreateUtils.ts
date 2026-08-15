import type { MobileCreatedKbKind } from '../storage/createdKnowledgeBases'

export type KnowledgeCreateForm = {
  name: string
  kind: MobileCreatedKbKind
  description?: string
  networkUrl?: string
}

export const KNOWLEDGE_CREATE_KINDS: Array<{ id: MobileCreatedKbKind; label: string }> = [
  { id: 'local', label: '本地知识库' },
  { id: 'sync', label: '同步知识库' },
  { id: 'network', label: '网络知识库' },
]

export function normalizeKnowledgeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function deriveNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

export function knowledgeCreateKindHint(kind: MobileCreatedKbKind): string {
  if (kind === 'network') return '创建后将记录该网页地址，也可稍后继续添加更多网页。'
  if (kind === 'sync') return '创建后可在知识库中添加文件；与桌面同步的知识库会出现在「同步知识库」。'
  return '创建后可在知识库中添加 MD/TXT/PDF/DOCX/HTML 等文件。'
}

export function knowledgeCreateNamePlaceholder(isNetwork: boolean): string {
  return isNetwork ? '例如：产品文档（可选，填写网络地址时自动填充）' : '例如：产品文档'
}

export function buildKnowledgeCreateForm(input: {
  name: string
  kind: MobileCreatedKbKind
  description: string
  networkUrl: string
}): { form: KnowledgeCreateForm } | { error: string } {
  const trimmedName = input.name.trim()
  const description = input.description.trim() || undefined
  if (input.kind === 'network') {
    const normalized = normalizeKnowledgeUrl(input.networkUrl)
    if (!normalized) return { error: '请输入网络地址' }
    try {
      new URL(normalized)
    } catch {
      return { error: '请输入有效的网络地址' }
    }
    if (!trimmedName) return { error: '请输入知识库名称，或填写网络地址' }
    return {
      form: {
        name: trimmedName,
        kind: input.kind,
        description,
        networkUrl: normalized,
      },
    }
  }
  if (!trimmedName) return { error: '请输入知识库名称' }
  return {
    form: {
      name: trimmedName,
      kind: input.kind,
      description,
    },
  }
}
