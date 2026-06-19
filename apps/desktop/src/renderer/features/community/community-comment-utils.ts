import type { CommunityCommentTargetType } from '@toolman/shared'

export const COMMUNITY_BOARD_MAIN_ID = 'main'

export interface CommunityCommentTarget {
  targetType: CommunityCommentTargetType
  targetId: string
  parentId?: string | null
}

export function buildNewsCommentTarget(articleId: string): CommunityCommentTarget {
  return {
    targetType: 'news',
    targetId: articleId,
  }
}

export function buildResourceCommentTarget(resourceId: string): CommunityCommentTarget {
  return {
    targetType: 'resource',
    targetId: resourceId,
  }
}

export function buildBoardReplyTarget(messageId: string): CommunityCommentTarget {
  return {
    targetType: 'board',
    targetId: COMMUNITY_BOARD_MAIN_ID,
    parentId: messageId,
  }
}

export function buildTaskCommentTarget(taskId: string): CommunityCommentTarget {
  return {
    targetType: 'task',
    targetId: taskId,
  }
}

export function commentTargetKey(target: CommunityCommentTarget): string {
  return `${target.targetType}:${target.targetId}:${target.parentId ?? ''}`
}
