import type { zhCN } from './zh-CN'
import { agentEn } from './partials/agent'
import { chatEn } from './partials/chat'
import { systemEn } from './partials/system'
import { userEn } from './partials/user'
import {
  communityPageEn,
  groupPageEn,
  knowledgePageEn,
  notesPageEn,
  toolApprovalPageEn,
} from './partials/pages'
import { coreEn } from './partials/core'

type DeepStringMap<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringMap<T[K]>
}

export const en: DeepStringMap<typeof zhCN> = {
  ...coreEn,
  system: systemEn,
  agent: agentEn,
  chat: chatEn,
  user: userEn,
  knowledgePage: knowledgePageEn,
  notesPage: notesPageEn,
  groupPage: groupPageEn,
  communityPage: communityPageEn,
  toolApprovalPage: toolApprovalPageEn,
}
