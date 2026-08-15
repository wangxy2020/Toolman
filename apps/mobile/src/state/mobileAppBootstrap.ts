import type { MobileAuthSession } from '../auth/types'
import type { AgentChatScope } from '../chat/agentScopes'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import type { ChatSession } from './MobileAppContext'

export const EMPTY_ACTIVE: Record<AgentChatScope, string | null> = {
  agent: null,
  classroom: null,
  projects: null,
}

export function classroomSessionFromCourse(course: MobileClassroomCourse): ChatSession {
  return {
    id: course.id,
    title: course.courseName || course.title,
    updatedAt: course.updatedAt,
    messages: [],
    agentScope: 'classroom',
  }
}

export function legacySessionFromSecure(
  identity: { identityId: string; displayName: string },
  accessToken: string,
): MobileAuthSession {
  return {
    identityId: identity.identityId,
    displayName: identity.displayName,
    accessToken,
    email: '',
    phone: null,
    accountKind: 'email',
    region: 'cn',
    subscriptionSku: 'community',
    entitlements: [],
    communityRole: null,
    lastLoginAt: Date.now(),
    wechatBound: false,
  }
}
