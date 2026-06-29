import { type CommunityModerationScanResource, type CommunityResourceType } from '@toolman/shared'

import {
  type AdminSubTab,
  type ModerationSubTab,
  type OnlineSubTab,
  type ResourceSubTab,
  type ReviewSubTab,
} from './community-moderation-utils'

export function isReviewSubTab(subTab: ModerationSubTab): subTab is ReviewSubTab {
  return subTab === 'pending' || subTab === 'reports'
}

export function isResourceSubTab(subTab: ModerationSubTab): subTab is ResourceSubTab {
  return (
    subTab === 'messages' ||
    subTab === 'knowledge' ||
    subTab === 'mcp' ||
    subTab === 'skill' ||
    subTab === 'workflow' ||
    subTab === 'tasks'
  )
}

export function isOnlineSubTab(subTab: ModerationSubTab): subTab is OnlineSubTab {
  return subTab === 'desktop' || subTab === 'mobile'
}

export function isAdminSubTab(subTab: ModerationSubTab): subTab is AdminSubTab {
  return subTab === 'registeredUsers' || subTab === 'admins' || subTab === 'blacklist'
}

export function filterResourcesByType(
  resources: CommunityModerationScanResource[],
  resourceType: CommunityResourceType,
) {
  return resources.filter((resource) => resource.resourceType === resourceType)
}
