import { truncateAttachmentName } from '@toolman/shared'
import { IconFile } from '../../components/icons'

interface Props {
  name: string
  onRemove: () => void
}

export function MessageAttachmentChip({ name, onRemove }: Props) {
  return (
    <div className="tm-input-attachment-chip">
      <span className="tm-input-attachment-chip-icon" aria-hidden="true">
        <IconFile size={14} />
      </span>
      <span className="tm-input-attachment-chip-name" title={name}>
        {truncateAttachmentName(name)}
      </span>
      <button
        type="button"
        className="tm-input-attachment-chip-remove"
        aria-label={`移除 ${name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}
