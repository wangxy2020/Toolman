import type { P2pKnowledgeDocumentPermission, P2pSharedResource } from '@toolman/shared'

export function getKnowledgeDocumentPermission(
  resource: P2pSharedResource,
  documentId: string,
): P2pKnowledgeDocumentPermission {
  return resource.sharedDocumentPermissions?.[documentId] ?? 'read'
}

export function formatKnowledgeDocumentPermissionLabel(
  permission: P2pKnowledgeDocumentPermission,
): string {
  return permission === 'savable' ? '可保存' : '仅阅读'
}
