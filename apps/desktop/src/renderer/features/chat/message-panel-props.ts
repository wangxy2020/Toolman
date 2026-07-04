import type { MessagePanelProps } from './message-panel-types'

/** Ignore callback identity so task/popup UI updates do not remount the message list. */
export function areMessagePanelPropsEqual(
  prev: MessagePanelProps,
  next: MessagePanelProps,
): boolean {
  return (
    prev.messages === next.messages &&
    prev.loading === next.loading &&
    prev.sending === next.sending &&
    prev.editingUserMessageId === next.editingUserMessageId &&
    prev.pendingMessageAction === next.pendingMessageAction &&
    prev.assistantName === next.assistantName &&
    prev.defaultModelId === next.defaultModelId &&
    prev.sendShortcut === next.sendShortcut &&
    prev.messageSettings === next.messageSettings &&
    prev.translationLanguages === next.translationLanguages &&
    prev.emptyTitle === next.emptyTitle &&
    prev.emptyHint === next.emptyHint &&
    prev.loadingLabel === next.loadingLabel &&
    prev.getUserDisplayName === next.getUserDisplayName &&
    prev.getUserAvatarInitial === next.getUserAvatarInitial &&
    prev.isOwnUserMessage === next.isOwnUserMessage
  )
}
