import { MessageAttachmentChip } from './MessageAttachmentChip'
import { MessageInputFooter } from './MessageInputFooter'
import { MessageInputPopups } from './MessageInputPopups'
import { MessageInputToolbar } from './MessageInputToolbar'
import type { MessageInputProps } from './message-input-types'
import { shouldSubmitOnEnter } from './message-input-utils'
import { useMessageInput } from './useMessageInput'

export function MessageInput(props: MessageInputProps) {
  const input = useMessageInput(props)
  const {
    disabled,
    streaming,
    spellCheckEnabled,
    sendShortcut,
    text,
    setText,
    fieldHeight,
    pendingAttachments,
    setPendingAttachments,
    textareaRef,
    handleInputDragOver,
    handleInputDrop,
    handleSubmit,
    placeholder,
  } = input

  return (
    <div className="tm-input-area">
      <div
        className="tm-input-box"
        onDragOver={handleInputDragOver}
        onDrop={handleInputDrop}
      >
        <MessageInputToolbar input={input} />
        <MessageInputPopups input={input} />

        {pendingAttachments.length > 0 ? (
          <div className="tm-input-attachments">
            {pendingAttachments.map((attachment) => (
              <MessageAttachmentChip
                key={attachment.path}
                name={attachment.name}
                onRemove={() =>
                  setPendingAttachments((prev) =>
                    prev.filter((item) => item.path !== attachment.path),
                  )
                }
              />
            ))}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className="tm-input-field"
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          spellCheck={spellCheckEnabled}
          style={{ height: fieldHeight }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (shouldSubmitOnEnter(e, sendShortcut)) {
              e.preventDefault()
              if (!streaming) handleSubmit()
            }
          }}
        />

        <MessageInputFooter input={input} defaultModelId={props.defaultModelId} />
      </div>
    </div>
  )
}
