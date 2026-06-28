import type { KnowledgeBaseRow } from '@toolman/db'

export function isUrlKnowledgePath(path: string | null | undefined): boolean {
  if (!path) return false
  return path.startsWith('http://') || path.startsWith('https://')
}

export function assertKnowledgeBaseAcceptsLocalFiles(kb: Pick<KnowledgeBaseRow, 'kind'>): void {
  if (kb.kind === 'network') {
    throw new Error('网络知识库仅支持网页 URL，不能导入本地文件')
  }
  if (kb.kind === 'shared') {
    throw new Error('共享知识库不支持直接导入本地文件')
  }
}

export function assertKnowledgeBaseAcceptsUrls(kb: Pick<KnowledgeBaseRow, 'kind'>): void {
  if (kb.kind === 'local') {
    throw new Error('本地知识库仅支持上传文件，网页请添加到网络知识库')
  }
  if (kb.kind === 'local_files') {
    throw new Error('本地文件库仅支持文件存储，网页请添加到网络知识库')
  }
}
