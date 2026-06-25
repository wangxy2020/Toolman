export {
  formatAbsoluteTime,
  formatP2pEventMessage,
  formatP2pEventTime,
  getP2pResourceLabel,
  shortDeviceId,
} from '../../i18n/group-event-labels'

// Legacy export for callers that still import P2P_RESOURCE_LABELS; prefer getP2pResourceLabel(t).
export const P2P_RESOURCE_LABELS = {} as never
