import type { CommunityComment } from '@toolman/shared'

import type { CommunityCommentTarget } from './community-comment-utils'
import { commentTargetKey } from './community-comment-utils'
import {
  COMMUNITY_UI_MOCK_ENABLED,
  COMMUNITY_UI_MOCK_IDS,
  isUiMockCommunityId,
} from './community-ui-mock'

const MOCK_AUTHOR = {
  id: '00000000-0000-4000-8000-000000000101',
  displayName: 'UI 预览用户',
}

const store = new Map<string, CommunityComment[]>()
let mockCommentSeq = 1

function nextMockCommentId(): string {
  const suffix = String(mockCommentSeq++).padStart(12, '0')
  return `00000000-0000-4000-8000-${suffix}`
}

function seedMockComments() {
  if (store.size > 0) return

  const now = Date.UTC(2026, 5, 1, 8, 0, 0)
  store.set(
    commentTargetKey({
      targetType: 'board',
      targetId: 'main',
      parentId: COMMUNITY_UI_MOCK_IDS.message,
    }),
    [
      {
        id: nextMockCommentId(),
        targetType: 'board',
        targetId: 'main',
        parentId: COMMUNITY_UI_MOCK_IDS.message,
        userId: MOCK_AUTHOR.id,
        author: MOCK_AUTHOR,
        body: '[UI 预览] 这是一条虚拟回复评论。',
        createdAt: now,
        updatedAt: now,
      },
    ],
  )
}

export function isUiMockCommentTarget(target: CommunityCommentTarget | null): boolean {
  if (!target || !COMMUNITY_UI_MOCK_ENABLED) return false
  if (isUiMockCommunityId(target.targetId)) return true
  if (target.parentId && isUiMockCommunityId(target.parentId)) return true
  return false
}

export function listUiMockComments(target: CommunityCommentTarget): CommunityComment[] {
  seedMockComments()
  return [...(store.get(commentTargetKey(target)) ?? [])]
}

export function addUiMockComment(
  target: CommunityCommentTarget,
  body: string,
  author: { id: string; displayName: string },
): CommunityComment {
  seedMockComments()
  const key = commentTargetKey(target)
  const now = Date.now()
  const comment: CommunityComment = {
    id: nextMockCommentId(),
    targetType: target.targetType,
    targetId: target.targetId,
    parentId: target.parentId ?? null,
    userId: author.id,
    author: {
      id: author.id,
      displayName: author.displayName,
    },
    body,
    createdAt: now,
    updatedAt: now,
  }
  const items = store.get(key) ?? []
  store.set(key, [...items, comment])
  return comment
}

export function deleteUiMockComment(
  target: CommunityCommentTarget,
  commentId: string,
): boolean {
  const key = commentTargetKey(target)
  const items = store.get(key)
  if (!items) return false
  const next = items.filter((item) => item.id !== commentId)
  if (next.length === items.length) return false
  store.set(key, next)
  return true
}
