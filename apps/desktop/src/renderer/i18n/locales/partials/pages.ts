import { communityPageHubEn } from './pages/community-hub.en'
import { communityPageHubZhCN } from './pages/community-hub.zh-CN'
import { communityPageMarketEn } from './pages/community-market.en'
import { communityPageMarketZhCN } from './pages/community-market.zh-CN'
import { communityPageUserEn } from './pages/community-user.en'
import { communityPageUserZhCN } from './pages/community-user.zh-CN'
import { groupPageCoreEn } from './pages/group-core.en'
import { groupPageCoreZhCN } from './pages/group-core.zh-CN'
import { groupPageExtendedEn } from './pages/group-extended.en'
import { groupPageExtendedZhCN } from './pages/group-extended.zh-CN'

export { knowledgePageZhCN } from './pages/knowledge.zh-CN'
export { knowledgePageEn } from './pages/knowledge.en'
export { notesPageZhCN } from './pages/notes.zh-CN'
export { notesPageEn } from './pages/notes.en'
export const groupPageZhCN = { ...groupPageCoreZhCN, ...groupPageExtendedZhCN } as const
export const groupPageEn = { ...groupPageCoreEn, ...groupPageExtendedEn } as const
export const communityPageZhCN = { ...communityPageHubZhCN, ...communityPageMarketZhCN, ...communityPageUserZhCN } as const
export const communityPageEn = { ...communityPageHubEn, ...communityPageMarketEn, ...communityPageUserEn } as const
export { toolApprovalPageZhCN } from './pages/tool-approval.zh-CN'
export { toolApprovalPageEn } from './pages/tool-approval.en'
export { projectManagerPageZhCN } from './pages/project-manager.zh-CN'
export { projectManagerPageEn } from './pages/project-manager.en'
