import { agentZhCN } from './partials/agent'
import { chatZhCN } from './partials/chat'
import { systemZhCN } from './partials/system'
import { userZhCN } from './partials/user'
import {
  communityPageZhCN,
  groupPageZhCN,
  knowledgePageZhCN,
  notesPageZhCN,
  projectManagerPageZhCN,
  toolApprovalPageZhCN,
} from './partials/pages'
import { coreZhCN } from './partials/core'

export const zhCN = {
  ...coreZhCN,
  system: systemZhCN,
  agent: agentZhCN,
  chat: chatZhCN,
  user: userZhCN,
  knowledgePage: knowledgePageZhCN,
  notesPage: notesPageZhCN,
  groupPage: groupPageZhCN,
  communityPage: communityPageZhCN,
  toolApprovalPage: toolApprovalPageZhCN,
  projectManagerPage: projectManagerPageZhCN,
} as const
