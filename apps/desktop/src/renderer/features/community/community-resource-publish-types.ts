import { type CommunityResourceItem, type CommunityResourceType } from '@toolman/shared'

export interface CommunityResourcePublishModalProps {
  resourceType: CommunityResourceType
  resourceLabel: string
  /** Continue publish for an existing draft or resubmit a rejected item. */
  resumeResource?: CommunityResourceItem | null
  /** Save metadata only (for rejected submissions). */
  editOnly?: boolean
  onClose: () => void
  onPublished?: (message: string) => void
}

export function getPackageDisplayName(path: string): string {
  if (!path) return ''
  const segments = path.split(/[/\\]/)
  return segments[segments.length - 1] ?? path
}
