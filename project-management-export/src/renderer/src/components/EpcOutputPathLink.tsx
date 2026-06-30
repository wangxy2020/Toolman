import { loggerService } from '@logger'
import { type KeyboardEvent, memo, useCallback } from 'react'
import styled from 'styled-components'

const logger = loggerService.withContext('EpcOutputPathLink')

interface Props {
  path: string
}

/** 步骤 5 输出母表：整段路径可点击打开，不重复显示文件名 */
export const EpcOutputPathLink = memo(function EpcOutputPathLink({ path }: Props) {
  const handleOpen = useCallback(() => {
    const open = () => window.api.file.openPath(path)
    open().catch(() =>
      window.api.openPath(path).catch((error) => {
        logger.warn('open output path failed', { path, error })
        window.toast.error(path)
      })
    )
  }, [path])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleOpen()
      }
    },
    [handleOpen]
  )

  return (
    <LinkText role="link" tabIndex={0} title={path} onClick={handleOpen} onKeyDown={handleKeyDown}>
      {path}
    </LinkText>
  )
})

const LinkText = styled.span`
  display: block;
  color: var(--color-link);
  cursor: pointer;
  text-decoration: underline;
  word-break: break-all;
  font-size: 13px;
  line-height: 1.45;

  &:hover {
    opacity: 0.85;
  }
`
