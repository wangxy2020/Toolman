import { Virtuoso } from 'react-virtuoso'
import { MessageDeleteConfirmPopover } from './MessageDeleteConfirmPopover'
import { MessagePanelTurnView } from './MessagePanelTurnView'
import type { MessagePanelProps } from './message-panel-types'
import { useMessagePanel } from './useMessagePanel'

export function MessagePanel(props: MessagePanelProps) {
  const panel = useMessagePanel(props)
  const {
    resolvedEmptyTitle,
    resolvedEmptyHint,
    resolvedLoadingLabel,
    loading,
    messages,
    turns,
    useVirtualScroll,
    messagesContainerRef,
    bottomRef,
    virtuosoRef,
    deleteConfirm,
    setDeleteConfirm,
    handleConfirmDeleteMessage,
    turnViewProps,
  } = panel

  const deleteConfirmPopover =
    deleteConfirm ? (
      <MessageDeleteConfirmPopover
        anchorEl={deleteConfirm.anchorEl}
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeleteConfirm(null)}
      />
    ) : null

  if (loading) {
    return (
      <>
        <div className="tm-messages-center">{resolvedLoadingLabel}</div>
        {deleteConfirmPopover}
      </>
    )
  }

  if (messages.length === 0) {
    return (
      <>
        <div className="tm-messages-center">
          <div className="tm-messages-empty-title">{resolvedEmptyTitle}</div>
          <div>{resolvedEmptyHint}</div>
        </div>
        {deleteConfirmPopover}
      </>
    )
  }

  if (useVirtualScroll) {
    return (
      <>
        <div className="tm-messages tm-messages--virtualized">
          <Virtuoso
            ref={virtuosoRef}
            className="tm-messages-virtuoso"
            data={turns}
            followOutput="auto"
            alignToBottom
            initialTopMostItemIndex={Math.max(0, turns.length - 1)}
            increaseViewportBy={{ top: 600, bottom: 600 }}
            computeItemKey={(_index, turn) =>
              turn.type === 'user'
                ? turn.message.id
                : turn.messages.map((message) => message.id).join('-')
            }
            itemContent={(index, turn) => (
              <div
                className="tm-messages-turn"
                data-first={index === 0 ? 'true' : undefined}
                data-last={index === turns.length - 1 ? 'true' : undefined}
              >
                <MessagePanelTurnView turn={turn} {...turnViewProps} />
              </div>
            )}
          />
        </div>
        {deleteConfirmPopover}
      </>
    )
  }

  return (
    <>
      <div className="tm-messages" ref={messagesContainerRef}>
        {turns.map((turn) => (
          <MessagePanelTurnView
            key={
              turn.type === 'user'
                ? turn.message.id
                : turn.messages.map((message) => message.id).join('-')
            }
            turn={turn}
            {...turnViewProps}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      {deleteConfirmPopover}
    </>
  )
}
