import { IpcChannel } from '@toolman/shared'
import { IconFile, IconFolder } from '../../components/icons'
import { splitPathParts } from './parse-tool-result'

interface Props {
  path: string
  className?: string
  action?: 'open' | 'reveal'
  showFullPath?: boolean
}

export function LocalFilePathLink({
  path,
  className,
  action = 'open',
  showFullPath = false,
}: Props) {
  const { name, parent } = splitPathParts(path)
  const label = showFullPath ? path : name
  const Icon = action === 'reveal' ? IconFolder : IconFile

  return (
    <button
      type="button"
      className={[
        'tm-tool-office-path-link',
        showFullPath ? 'tm-tool-office-path-link--full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={path}
      onClick={() =>
        void window.api.invoke(
          action === 'reveal' ? IpcChannel.AppShellRevealPath : IpcChannel.AppShellOpenPath,
          { path },
        )
      }
    >
      <Icon size={15} />
      <span className="tm-tool-office-path-name">{label}</span>
      {!showFullPath && parent ? (
        <span className="tm-tool-office-path-parent">{parent}</span>
      ) : null}
    </button>
  )
}
