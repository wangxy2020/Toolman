export {
  EPC_COMMERCIAL_COMMAND_DESCRIPTION,
  EPC_COMMERCIAL_QUICK_PHRASE_TITLE,
  EPC_COMMERCIAL_REPORT_TITLE,
  EPC_COMMERCIAL_WORKFLOW_STEPS,
} from '@toolman/shared'

export { EPC_COMMERCIAL_COMMAND_TEMPLATE } from '@toolman/shared'

export {
  ipcTokenToPeriod,
  normalizeEpcSlashCommandInput,
  parseEpcCommercialCommandInput,
} from './epcCommercialMessage-command'

export {
  getEpcCommercialWorkflowUserRequest,
  resolveEpcCommercialWorkLaunch,
  isBuiltinEpcCommercialQuickPhraseId,
  isEpcCommercialWorkflowInput,
  isEpcCommercialWorkInput,
  parseEpcCommercialWorkflowInput,
  type EpcCommercialWorkLaunch,
} from './epcCommercialMessage-detect'

export { buildEpcCommercialAgentContextContent } from './epcCommercialMessage-context'
